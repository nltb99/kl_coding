import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { AppointmentsModule } from '../src/modules/appointments/appointments.module';
import { AvailabilityModule } from '../src/modules/availability/availability.module';
import { DealershipsModule } from '../src/modules/dealerships/dealerships.module';
import { ServiceTypesModule } from '../src/modules/service-types/service-types.module';
import { ServiceBaysModule } from '../src/modules/service-bays/service-bays.module';
import { TechniciansModule } from '../src/modules/technicians/technicians.module';
import { CustomersModule } from '../src/modules/customers/customers.module';
import { VehiclesModule } from '../src/modules/vehicles/vehicles.module';
import { SeedModule } from '../src/modules/seed/seed.module';

import { Dealership } from '../src/modules/dealerships/dealership.entity';
import { ServiceType } from '../src/modules/service-types/service-type.entity';
import { ServiceBay } from '../src/modules/service-bays/service-bay.entity';
import { Technician } from '../src/modules/technicians/technician.entity';
import { Customer } from '../src/modules/customers/customer.entity';
import { Vehicle } from '../src/modules/vehicles/vehicle.entity';
import { Appointment } from '../src/modules/appointments/appointment.entity';

const pinoProviders = [
  { provide: 'PinoLogger:AppointmentsService', useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
  { provide: 'PinoLogger:SeedService', useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
];

// ---------------------------------------------------------------------------

describe('Appointments Integration Tests', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  let dealershipId: string;
  let serviceTypeId: string;       // Oil Change — requires 'oil_change' skill
  let brakeServiceTypeId: string;  // Brake Service — requires 'brakes' skill
  let serviceBayId: string;
  let technicianId: string;        // Alice — has 'oil_change' skill only
  let customerId: string;
  let vehicleId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_scheduler')
      .withUsername('test')
      .withPassword('test')
      .start();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getPort(),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          entities: [Dealership, ServiceType, ServiceBay, Technician, Customer, Vehicle, Appointment],
          migrations: [__dirname + '/../src/database/migrations/*{.ts,.js}'],
          migrationsRun: true,
          synchronize: false,
          logging: false,
        }),
        AppointmentsModule,
        AvailabilityModule,
        DealershipsModule,
        ServiceTypesModule,
        ServiceBaysModule,
        TechniciansModule,
        CustomersModule,
        VehiclesModule,
        SeedModule,
      ],
      providers: pinoProviders,
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    await insertTestData();
  }, 120_000);

  async function insertTestData() {
    const dealership = await dataSource.getRepository(Dealership).save({ name: 'Test Dealership', address: '1 Test St' });
    dealershipId = dealership.id;

    const oilChange = await dataSource.getRepository(ServiceType).save({ name: 'Oil Change', durationMinutes: 30, requiredSkill: 'oil_change' });
    serviceTypeId = oilChange.id;

    const brakes = await dataSource.getRepository(ServiceType).save({ name: 'Brake Service', durationMinutes: 60, requiredSkill: 'brakes' });
    brakeServiceTypeId = brakes.id;

    const bay = await dataSource.getRepository(ServiceBay).save({ dealershipId, name: 'Bay 1' });
    serviceBayId = bay.id;

    // Alice only has oil_change skill — NOT brakes
    const tech = await dataSource.getRepository(Technician).save({ dealershipId, name: 'Alice', skills: ['oil_change'] });
    technicianId = tech.id;

    const customer = await dataSource.getRepository(Customer).save({ name: 'Test Customer', email: 'test@example.com' });
    customerId = customer.id;

    const vehicle = await dataSource.getRepository(Vehicle).save({
      customerId,
      vin: 'TEST00000000000001',
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
    });
    vehicleId = vehicle.id;
  }

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const availabilityUrl = (startTime: string, stId = serviceTypeId) =>
    `/api/availability?dealershipId=${dealershipId}&serviceTypeId=${stId}&startTime=${encodeURIComponent(startTime)}`;

  const bookingPayload = (startTime: string, overrides: Record<string, any> = {}) => ({
    customerId,
    vehicleId,
    technicianId,
    serviceBayId,
    serviceTypeId,
    startTime,
    ...overrides,
  });

  // Each test uses a unique hour to avoid cross-test slot conflicts
  let slotHour = 8;
  const nextSlot = () => `2026-08-01T${String(slotHour++).padStart(2, '0')}:00:00.000Z`;

  // ---------------------------------------------------------------------------
  // 1. Happy path
  // ---------------------------------------------------------------------------

  describe('POST /api/appointments — happy path', () => {
    it('creates appointment and returns 201 with confirmed status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(nextSlot()))
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('confirmed');
      expect(res.body).toHaveProperty('during');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Conflict — same technician overlapping time
  // ---------------------------------------------------------------------------

  describe('POST /api/appointments — conflict detection', () => {
    it('returns 409 when same technician is already booked in overlapping slot', async () => {
      const startTime = nextSlot();

      await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(startTime))
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(startTime)) // same tech, same time
        .expect(409);
    });

    it('returns 409 when same bay is already booked in overlapping slot', async () => {
      const startTime = nextSlot();

      // Book a second technician for the bay conflict test
      const tech2 = await dataSource.getRepository(Technician).save({
        dealershipId,
        name: 'Bob',
        skills: ['oil_change'],
      });

      await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(startTime))
        .expect(201);

      // Different tech, same bay, same time → bay conflict
      await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(startTime, { technicianId: tech2.id }))
        .expect(409);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Skill validation
  // ---------------------------------------------------------------------------

  describe('POST /api/appointments — skill validation', () => {
    it('returns 400 when technician does not have required skill for the service type', async () => {
      // Alice has oil_change but NOT brakes — booking brakes service with Alice should fail
      const res = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(nextSlot(), { serviceTypeId: brakeServiceTypeId }))
        .expect(400);

      expect(res.body.message).toMatch(/skill/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Validation — missing / invalid fields
  // ---------------------------------------------------------------------------

  describe('POST /api/appointments — request validation', () => {
    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/api/appointments')
        .send({ customerId })  // missing all other required fields
        .expect(400);
    });

    it('returns 400 when startTime is not a valid ISO date', async () => {
      await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload('not-a-date'))
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Availability reflects bookings
  // ---------------------------------------------------------------------------

  describe('GET /api/availability — reflects real-time state', () => {
    it('shows available=true before booking, available=false after booking', async () => {
      const startTime = nextSlot();

      const before = await request(app.getHttpServer())
        .get(availabilityUrl(startTime))
        .expect(200);
      expect(before.body.available).toBe(true);

      await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(startTime))
        .expect(201);

      const after = await request(app.getHttpServer())
        .get(availabilityUrl(startTime))
        .expect(200);
      expect(after.body.available).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Cancel + rebook
  // ---------------------------------------------------------------------------

  describe('PATCH /api/appointments/:id/cancel', () => {
    it('cancels appointment and slot becomes bookable again', async () => {
      const startTime = nextSlot();

      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(startTime))
        .expect(201);
      const id = bookRes.body.id;

      // Slot should be unavailable
      const notAvail = await request(app.getHttpServer()).get(availabilityUrl(startTime));
      expect(notAvail.body.available).toBe(false);

      // Cancel
      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/appointments/${id}/cancel`)
        .expect(200);
      expect(cancelRes.body.status).toBe('cancelled');

      // Slot should be available again
      const avail = await request(app.getHttpServer()).get(availabilityUrl(startTime));
      expect(avail.body.available).toBe(true);
    });

    it('returns 400 when cancelling an already-cancelled appointment', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(nextSlot()))
        .expect(201);
      const id = bookRes.body.id;

      await request(app.getHttpServer()).patch(`/api/appointments/${id}/cancel`).expect(200);
      await request(app.getHttpServer()).patch(`/api/appointments/${id}/cancel`).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Complete
  // ---------------------------------------------------------------------------

  describe('PATCH /api/appointments/:id/complete', () => {
    it('marks appointment as completed', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(nextSlot()))
        .expect(201);
      const id = bookRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/api/appointments/${id}/complete`)
        .expect(200);
      expect(res.body.status).toBe('completed');
    });

    it('returns 400 when trying to cancel a completed appointment', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(nextSlot()))
        .expect(201);
      const id = bookRes.body.id;

      await request(app.getHttpServer()).patch(`/api/appointments/${id}/complete`).expect(200);
      await request(app.getHttpServer()).patch(`/api/appointments/${id}/cancel`).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Reschedule
  // ---------------------------------------------------------------------------

  describe('PATCH /api/appointments/:id/reschedule', () => {
    it('reschedules appointment to a new time successfully', async () => {
      const originalTime = nextSlot();
      const newTime = nextSlot();

      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(originalTime))
        .expect(201);
      const id = bookRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/api/appointments/${id}/reschedule`)
        .send({ newStartTime: newTime })
        .expect(200);

      expect(res.body.status).toBe('confirmed');
      expect(new Date(res.body.during.start).toISOString()).toBe(new Date(newTime).toISOString());
    });

    it('frees the original slot after reschedule', async () => {
      const originalTime = nextSlot();
      const newTime = nextSlot();

      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(originalTime))
        .expect(201);
      const id = bookRes.body.id;

      // Original slot not available
      const before = await request(app.getHttpServer()).get(availabilityUrl(originalTime));
      expect(before.body.available).toBe(false);

      await request(app.getHttpServer())
        .patch(`/api/appointments/${id}/reschedule`)
        .send({ newStartTime: newTime })
        .expect(200);

      // Original slot is free again
      const after = await request(app.getHttpServer()).get(availabilityUrl(originalTime));
      expect(after.body.available).toBe(true);
    });

    it('returns 409 when rescheduling to a conflicting slot', async () => {
      const slot1 = nextSlot();
      const slot2 = nextSlot();

      // Book slot1 and slot2
      const book1 = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(slot1))
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(slot2))
        .expect(201);

      // Try to reschedule book1 to slot2 — conflict with existing booking
      await request(app.getHttpServer())
        .patch(`/api/appointments/${book1.body.id}/reschedule`)
        .send({ newStartTime: slot2 })
        .expect(409);
    });

    it('returns 400 when rescheduling a cancelled appointment', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(nextSlot()))
        .expect(201);
      const id = bookRes.body.id;

      await request(app.getHttpServer()).patch(`/api/appointments/${id}/cancel`).expect(200);

      await request(app.getHttpServer())
        .patch(`/api/appointments/${id}/reschedule`)
        .send({ newStartTime: nextSlot() })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Concurrent booking — race condition protection
  // ---------------------------------------------------------------------------

  describe('Race condition — concurrent requests for same slot', () => {
    it('10 simultaneous POST requests for same slot → exactly 1 succeeds, 9 get 409', async () => {
      const startTime = nextSlot();
      const payload = bookingPayload(startTime);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer()).post('/api/appointments').send(payload),
        ),
      );

      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(9);
    }, 30_000);
  });

  // ---------------------------------------------------------------------------
  // 10. GET /api/appointments — list and filter
  // ---------------------------------------------------------------------------

  describe('GET /api/appointments', () => {
    it('returns all appointments', async () => {
      const res = await request(app.getHttpServer()).get('/api/appointments').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('filters appointments by status', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(nextSlot()))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/appointments/${bookRes.body.id}/cancel`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/appointments?status=cancelled')
        .expect(200);

      expect(res.body.every((a: any) => a.status === 'cancelled')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. GET /api/appointments/:id
  // ---------------------------------------------------------------------------

  describe('GET /api/appointments/:id', () => {
    it('returns appointment with full relations (customer, vehicle, technician, bay)', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .send(bookingPayload(nextSlot()))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/appointments/${bookRes.body.id}`)
        .expect(200);

      expect(res.body).toHaveProperty('customer');
      expect(res.body).toHaveProperty('vehicle');
      expect(res.body).toHaveProperty('technician');
      expect(res.body).toHaveProperty('serviceBay');
      expect(res.body).toHaveProperty('serviceType');
    });

    it('returns 404 for non-existent appointment ID', async () => {
      await request(app.getHttpServer())
        .get('/api/appointments/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
