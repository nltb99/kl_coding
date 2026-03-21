import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { Technician } from "../technicians/technician.entity";
import { ServiceType } from "../service-types/service-type.entity";
import { Appointment } from "../appointments/appointment.entity";

export interface AvailabilityResult {
  available: boolean;
  startTime: Date;
  endTime: Date;
  availableBays: ServiceBay[];
  availableTechs: Technician[];
  serviceType: ServiceType;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(ServiceBay)
    private readonly serviceBayRepo: Repository<ServiceBay>,
    @InjectRepository(Technician)
    private readonly technicianRepo: Repository<Technician>,
    @InjectRepository(ServiceType)
    private readonly serviceTypeRepo: Repository<ServiceType>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
  ) {}

  async checkAvailability(
    dealershipId: string,
    serviceTypeId: string,
    startTime: Date,
  ): Promise<AvailabilityResult> {
    const serviceType = await this.serviceTypeRepo.findOne({
      where: { id: serviceTypeId },
    });
    if (!serviceType) {
      throw new NotFoundException(`Service type ${serviceTypeId} not found`);
    }

    const endTime = new Date(
      startTime.getTime() + serviceType.durationMinutes * 60 * 1000,
    );

    const availableBays = await this.getAvailableBays(
      dealershipId,
      startTime,
      endTime,
    );

    const availableTechs = await this.getAvailableTechnicians(
      dealershipId,
      serviceType.requiredSkill,
      startTime,
      endTime,
    );

    return {
      available: availableBays.length > 0 && availableTechs.length > 0,
      startTime,
      endTime,
      availableBays,
      availableTechs,
      serviceType,
    };
  }

  async getAvailableBays(
    dealershipId: string,
    startTime: Date,
    endTime: Date,
    manager?: EntityManager,
  ): Promise<ServiceBay[]> {
    const repo = manager
      ? manager.getRepository(ServiceBay)
      : this.serviceBayRepo;

    return repo
      .createQueryBuilder("bay")
      .where("bay.dealershipId = :dealershipId", { dealershipId })
      .andWhere("bay.isActive = true")
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.service_bay_id = bay.id
            AND a.status != 'cancelled'
            AND a.during && tsrange(:start, :end)
        )`,
        { start: startTime.toISOString(), end: endTime.toISOString() },
      )
      .getMany();
  }

  async getAvailableTechnicians(
    dealershipId: string,
    requiredSkill: string,
    startTime: Date,
    endTime: Date,
    manager?: EntityManager,
  ): Promise<Technician[]> {
    const repo = manager
      ? manager.getRepository(Technician)
      : this.technicianRepo;

    return repo
      .createQueryBuilder("tech")
      .where("tech.dealershipId = :dealershipId", { dealershipId })
      .andWhere("tech.isActive = true")
      .andWhere(":skill = ANY(tech.skills)", { skill: requiredSkill })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.technician_id = tech.id
            AND a.status != 'cancelled'
            AND a.during && tsrange(:start, :end)
        )`,
        { start: startTime.toISOString(), end: endTime.toISOString() },
      )
      .getMany();
  }

  async hasConflict(
    technicianId: string,
    serviceBayId: string,
    startTime: Date,
    endTime: Date,
    manager?: EntityManager,
    excludeAppointmentId?: string,
  ): Promise<boolean> {
    const repo = manager
      ? manager.getRepository(Appointment)
      : this.appointmentRepo;

    let qb = repo
      .createQueryBuilder("a")
      .where("a.status != :cancelled", { cancelled: "cancelled" })
      .andWhere("a.during && tsrange(:start, :end)", {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      })
      .andWhere("(a.technicianId = :techId OR a.serviceBayId = :bayId)", {
        techId: technicianId,
        bayId: serviceBayId,
      });

    if (excludeAppointmentId) {
      qb = qb.andWhere("a.id != :excludeId", {
        excludeId: excludeAppointmentId,
      });
    }

    const count = await qb.getCount();
    return count > 0;
  }
}
