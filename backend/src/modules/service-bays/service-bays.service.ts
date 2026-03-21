import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ServiceBay } from "./service-bay.entity";

@Injectable()
export class ServiceBaysService {
  constructor(
    @InjectRepository(ServiceBay)
    private readonly serviceBayRepo: Repository<ServiceBay>,
  ) {}

  findByDealership(dealershipId: string): Promise<ServiceBay[]> {
    return this.serviceBayRepo.find({
      where: { dealershipId, isActive: true },
    });
  }
}
