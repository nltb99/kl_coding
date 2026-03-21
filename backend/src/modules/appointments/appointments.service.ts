import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Appointment } from "./appointment.entity";
import { Technician } from "../technicians/technician.entity";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { ServiceType } from "../service-types/service-type.entity";
import { AvailabilityService } from "../availability/availability.service";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";

type AppointmentStatus = "confirmed" | "cancelled" | "completed";

const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  confirmed: ["cancelled", "completed"],
  completed: [],
  cancelled: [],
};

function assertTransition(
  current: string,
  next: AppointmentStatus,
  id: string,
): void {
  const allowed = VALID_TRANSITIONS[current as AppointmentStatus] ?? [];
  if (!allowed.includes(next)) {
    throw new BadRequestException(
      `Cannot transition appointment ${id} from '${current}' to '${next}'`,
    );
  }
}

@Injectable()
export class AppointmentsService {
  // In-memory idempotency store: key → { result, expiresAt }
  private readonly idempotencyCache = new Map<
    string,
    { result: Appointment; expiresAt: number }
  >();

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Technician)
    private readonly technicianRepo: Repository<Technician>,
    @InjectRepository(ServiceBay)
    private readonly serviceBayRepo: Repository<ServiceBay>,
    @InjectRepository(ServiceType)
    private readonly serviceTypeRepo: Repository<ServiceType>,
    private readonly availabilityService: AvailabilityService,
    private readonly dataSource: DataSource,
    @InjectPinoLogger(AppointmentsService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createAppointment(
    dto: CreateAppointmentDto,
    idempotencyKey?: string,
  ): Promise<Appointment> {
    // Idempotency check
    if (idempotencyKey) {
      const cached = this.idempotencyCache.get(idempotencyKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.info(
          { idempotencyKey },
          "Returning cached idempotent response",
        );
        return cached.result;
      }
    }

    this.logger.info({ dto }, "Attempting to create appointment");

    const serviceType = await this.serviceTypeRepo.findOne({
      where: { id: dto.serviceTypeId },
    });
    if (!serviceType) {
      throw new NotFoundException(
        `Service type ${dto.serviceTypeId} not found`,
      );
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(
      startTime.getTime() + serviceType.durationMinutes * 60 * 1000,
    );

    const result = await this.dataSource.transaction(
      "REPEATABLE READ",
      async (manager) => {
        // Acquire pessimistic locks in consistent order (tech before bay) to prevent deadlocks
        const technician = await manager
          .createQueryBuilder(Technician, "tech")
          .setLock("pessimistic_write")
          .where("tech.id = :id", { id: dto.technicianId })
          .getOne();

        if (!technician) {
          throw new NotFoundException(
            `Technician ${dto.technicianId} not found`,
          );
        }

        // Validate technician has the required skill for this service type
        if (!technician.skills.includes(serviceType.requiredSkill)) {
          throw new BadRequestException(
            `Technician ${technician.name} does not have the required skill '${serviceType.requiredSkill}' for ${serviceType.name}`,
          );
        }

        const serviceBay = await manager
          .createQueryBuilder(ServiceBay, "bay")
          .setLock("pessimistic_write")
          .where("bay.id = :id", { id: dto.serviceBayId })
          .getOne();

        if (!serviceBay) {
          throw new NotFoundException(
            `Service bay ${dto.serviceBayId} not found`,
          );
        }

        // Double-check availability within the locked transaction
        const hasConflict = await this.availabilityService.hasConflict(
          dto.technicianId,
          dto.serviceBayId,
          startTime,
          endTime,
          manager,
        );

        if (hasConflict) {
          this.logger.warn(
            {
              technicianId: dto.technicianId,
              serviceBayId: dto.serviceBayId,
              startTime,
            },
            "Booking conflict detected within transaction",
          );
          throw new ConflictException("Slot no longer available");
        }

        const appointment = manager.create(Appointment, {
          customerId: dto.customerId,
          vehicleId: dto.vehicleId,
          technicianId: dto.technicianId,
          serviceBayId: dto.serviceBayId,
          serviceTypeId: dto.serviceTypeId,
          during: { start: startTime, end: endTime },
          status: "confirmed",
          notes: dto.notes,
        });

        try {
          const saved = await manager.save(appointment);
          this.logger.info(
            { appointmentId: saved.id },
            "Appointment created successfully",
          );
          return saved;
        } catch (err) {
          if (err.code === "23P01") {
            // PostgreSQL exclusion_violation
            this.logger.warn(
              { code: err.code, detail: err.detail },
              "Exclusion constraint violation — concurrent booking conflict",
            );
            throw new ConflictException(
              "Booking conflict: slot was taken simultaneously",
            );
          }
          throw err;
        }
      },
    );

    // Cache result for idempotency (24 h TTL)
    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, {
        result,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
    }

    return result;
  }

  async findAll(customerId?: string, status?: string): Promise<Appointment[]> {
    const qb = this.appointmentRepo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.customer", "customer")
      .leftJoinAndSelect("a.vehicle", "vehicle")
      .leftJoinAndSelect("a.technician", "technician")
      .leftJoinAndSelect("a.serviceBay", "serviceBay")
      .leftJoinAndSelect("serviceBay.dealership", "dealership")
      .leftJoinAndSelect("a.serviceType", "serviceType")
      .orderBy("a.createdAt", "DESC");

    if (customerId) {
      qb.andWhere("a.customerId = :customerId", { customerId });
    }
    if (status) {
      qb.andWhere("a.status = :status", { status });
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Appointment> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id },
      relations: [
        "customer",
        "vehicle",
        "technician",
        "serviceBay",
        "serviceBay.dealership",
        "serviceType",
      ],
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }
    return appointment;
  }

  async cancel(id: string): Promise<Appointment> {
    const appointment = await this.findOne(id);
    assertTransition(appointment.status, "cancelled", id);
    appointment.status = "cancelled";
    return this.appointmentRepo.save(appointment);
  }

  async complete(id: string): Promise<Appointment> {
    const appointment = await this.findOne(id);
    assertTransition(appointment.status, "completed", id);
    appointment.status = "completed";
    return this.appointmentRepo.save(appointment);
  }

  async reschedule(
    id: string,
    dto: RescheduleAppointmentDto,
  ): Promise<Appointment> {
    const existing = await this.findOne(id);

    if (existing.status !== "confirmed") {
      throw new BadRequestException(
        `Only confirmed appointments can be rescheduled (current status: '${existing.status}')`,
      );
    }

    const serviceType = await this.serviceTypeRepo.findOne({
      where: { id: existing.serviceTypeId },
    });
    if (!serviceType) {
      throw new NotFoundException(
        `Service type ${existing.serviceTypeId} not found`,
      );
    }

    const newStartTime = new Date(dto.newStartTime);
    const newEndTime = new Date(
      newStartTime.getTime() + serviceType.durationMinutes * 60 * 1000,
    );
    const newTechId = dto.technicianId ?? existing.technicianId;
    const newBayId = dto.serviceBayId ?? existing.serviceBayId;

    return this.dataSource.transaction("REPEATABLE READ", async (manager) => {
      // Lock the appointment row
      const locked = await manager
        .createQueryBuilder(Appointment, "a")
        .setLock("pessimistic_write")
        .where("a.id = :id", { id })
        .getOne();

      if (!locked) {
        throw new NotFoundException(`Appointment ${id} not found`);
      }

      if (locked.status !== "confirmed") {
        throw new BadRequestException(
          `Appointment ${id} is no longer confirmed`,
        );
      }

      // Lock technician and bay
      const technician = await manager
        .createQueryBuilder(Technician, "tech")
        .setLock("pessimistic_write")
        .where("tech.id = :id", { id: newTechId })
        .getOne();

      if (!technician) {
        throw new NotFoundException(`Technician ${newTechId} not found`);
      }

      // Validate technician has the required skill for this service type
      if (!technician.skills.includes(serviceType.requiredSkill)) {
        throw new BadRequestException(
          `Technician ${technician.name} does not have the required skill '${serviceType.requiredSkill}' for ${serviceType.name}`,
        );
      }

      const serviceBay = await manager
        .createQueryBuilder(ServiceBay, "bay")
        .setLock("pessimistic_write")
        .where("bay.id = :id", { id: newBayId })
        .getOne();

      if (!serviceBay) {
        throw new NotFoundException(`Service bay ${newBayId} not found`);
      }

      // Check conflict, excluding the current appointment
      const hasConflict = await this.availabilityService.hasConflict(
        newTechId,
        newBayId,
        newStartTime,
        newEndTime,
        manager,
        id, // exclude self
      );

      if (hasConflict) {
        this.logger.warn(
          { technicianId: newTechId, serviceBayId: newBayId, newStartTime },
          "Reschedule conflict detected",
        );
        throw new ConflictException(
          "New time slot is unavailable for the selected technician or bay",
        );
      }

      locked.during = { start: newStartTime, end: newEndTime };
      locked.technicianId = newTechId;
      locked.serviceBayId = newBayId;
      if (dto.notes !== undefined) {
        locked.notes = dto.notes;
      }

      try {
        const saved = await manager.save(locked);
        this.logger.info(
          { appointmentId: saved.id, newStartTime },
          "Appointment rescheduled successfully",
        );
        return saved;
      } catch (err) {
        if (err.code === "23P01") {
          this.logger.warn(
            { code: err.code, detail: err.detail },
            "Exclusion constraint violation — concurrent reschedule conflict",
          );
          throw new ConflictException(
            "Reschedule conflict: slot was taken simultaneously",
          );
        }
        throw err;
      }
    });
  }
}
