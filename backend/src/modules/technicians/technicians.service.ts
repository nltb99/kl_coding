import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Technician } from "./technician.entity";

@Injectable()
export class TechniciansService {
  constructor(
    @InjectRepository(Technician)
    private readonly technicianRepo: Repository<Technician>,
  ) {}

  findByDealership(dealershipId: string): Promise<Technician[]> {
    return this.technicianRepo.find({
      where: { dealershipId, isActive: true },
    });
  }

  findOne(id: string): Promise<Technician | null> {
    return this.technicianRepo.findOne({ where: { id } });
  }
}
