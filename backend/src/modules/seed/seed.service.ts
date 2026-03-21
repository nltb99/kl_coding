import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Dealership } from "../dealerships/dealership.entity";
import { ServiceType } from "../service-types/service-type.entity";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { Technician } from "../technicians/technician.entity";
import { Customer } from "../customers/customer.entity";
import { Vehicle } from "../vehicles/vehicle.entity";

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Dealership)
    private readonly dealershipRepo: Repository<Dealership>,
    @InjectRepository(ServiceType)
    private readonly serviceTypeRepo: Repository<ServiceType>,
    @InjectRepository(ServiceBay)
    private readonly serviceBayRepo: Repository<ServiceBay>,
    @InjectRepository(Technician)
    private readonly technicianRepo: Repository<Technician>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly config: ConfigService,
    @InjectPinoLogger(SeedService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get("SEED_ON_STARTUP") !== "true") {
      return;
    }

    const count = await this.dealershipRepo.count();
    if (count > 0) {
      this.logger.info("Seed data already exists, skipping");
      return;
    }

    this.logger.info("Seeding demo data...");
    await this.seed();
    this.logger.info("Seed complete");
  }

  async seed() {
    // Dealerships
    const london = await this.dealershipRepo.save(
      this.dealershipRepo.create({
        name: "Keyloop London",
        address: "1 King Street, London, EC1A 1BB",
      }),
    );
    const birmingham = await this.dealershipRepo.save(
      this.dealershipRepo.create({
        name: "Keyloop Birmingham",
        address: "5 Broad Street, Birmingham, B1 2EA",
      }),
    );

    // Service Types
    const [oilChange, tireRotation, brakeInspection, motCheck, fullService] =
      await this.serviceTypeRepo.save([
        this.serviceTypeRepo.create({
          name: "Oil Change",
          durationMinutes: 30,
          requiredSkill: "oil_change",
        }),
        this.serviceTypeRepo.create({
          name: "Tire Rotation",
          durationMinutes: 45,
          requiredSkill: "tire_rotation",
        }),
        this.serviceTypeRepo.create({
          name: "Brake Inspection",
          durationMinutes: 60,
          requiredSkill: "brakes",
        }),
        this.serviceTypeRepo.create({
          name: "MOT Check",
          durationMinutes: 90,
          requiredSkill: "mot",
        }),
        this.serviceTypeRepo.create({
          name: "Full Service",
          durationMinutes: 120,
          requiredSkill: "full_service",
        }),
      ]);

    // Service Bays — 2 per dealership
    await this.serviceBayRepo.save([
      this.serviceBayRepo.create({ dealershipId: london.id, name: "Bay 1" }),
      this.serviceBayRepo.create({ dealershipId: london.id, name: "Bay 2" }),
      this.serviceBayRepo.create({
        dealershipId: birmingham.id,
        name: "Bay A",
      }),
      this.serviceBayRepo.create({
        dealershipId: birmingham.id,
        name: "Bay B",
      }),
    ]);

    // Technicians — 3 per dealership with varied skills
    await this.technicianRepo.save([
      this.technicianRepo.create({
        dealershipId: london.id,
        name: "Alice Johnson",
        skills: ["oil_change", "tire_rotation", "brakes"],
      }),
      this.technicianRepo.create({
        dealershipId: london.id,
        name: "Bob Williams",
        skills: ["mot", "full_service", "brakes"],
      }),
      this.technicianRepo.create({
        dealershipId: london.id,
        name: "Carol Smith",
        skills: ["oil_change", "tire_rotation", "mot"],
      }),
      this.technicianRepo.create({
        dealershipId: birmingham.id,
        name: "David Brown",
        skills: ["oil_change", "tire_rotation", "brakes"],
      }),
      this.technicianRepo.create({
        dealershipId: birmingham.id,
        name: "Emma Davis",
        skills: ["mot", "full_service"],
      }),
      this.technicianRepo.create({
        dealershipId: birmingham.id,
        name: "Frank Wilson",
        skills: ["oil_change", "brakes", "full_service"],
      }),
    ]);

    // Customers and vehicles
    const alice = await this.customerRepo.save(
      this.customerRepo.create({
        name: "Jane Doe",
        email: "jane.doe@example.com",
        phone: "+44 7700 900123",
      }),
    );
    const bob = await this.customerRepo.save(
      this.customerRepo.create({
        name: "John Smith",
        email: "john.smith@example.com",
        phone: "+44 7700 900456",
      }),
    );
    const carol = await this.customerRepo.save(
      this.customerRepo.create({
        name: "Sarah Connor",
        email: "sarah.connor@example.com",
        phone: "+44 7700 900789",
      }),
    );

    await this.vehicleRepo.save([
      this.vehicleRepo.create({
        customerId: alice.id,
        vin: "WAUZZZ8K9BA123456",
        make: "Audi",
        model: "A4",
        year: 2021,
      }),
      this.vehicleRepo.create({
        customerId: bob.id,
        vin: "WBAFG21070LT12345",
        make: "BMW",
        model: "3 Series",
        year: 2020,
      }),
      this.vehicleRepo.create({
        customerId: carol.id,
        vin: "SAJAA01T65HM12345",
        make: "Jaguar",
        model: "XE",
        year: 2022,
      }),
    ]);
  }
}
