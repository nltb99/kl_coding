import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ServiceType } from "./service-type.entity";

@Injectable()
export class ServiceTypesService {
  constructor(
    @InjectRepository(ServiceType)
    private readonly serviceTypeRepo: Repository<ServiceType>,
  ) {}

  findAll(): Promise<ServiceType[]> {
    return this.serviceTypeRepo.find({ order: { name: "ASC" } });
  }

  findOne(id: string): Promise<ServiceType | null> {
    return this.serviceTypeRepo.findOne({ where: { id } });
  }
}
