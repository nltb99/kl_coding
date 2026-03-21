import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Vehicle } from "./vehicle.entity";

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  findByCustomer(customerId: string): Promise<Vehicle[]> {
    return this.vehicleRepo.find({ where: { customerId } });
  }

  findOne(id: string): Promise<Vehicle | null> {
    return this.vehicleRepo.findOne({ where: { id } });
  }

  async upsert(data: Partial<Vehicle>): Promise<Vehicle> {
    const existing = data.vin
      ? await this.vehicleRepo.findOne({ where: { vin: data.vin } })
      : null;
    if (existing) return existing;
    return this.vehicleRepo.save(this.vehicleRepo.create(data));
  }
}
