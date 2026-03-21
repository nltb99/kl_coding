import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Dealership } from "./dealership.entity";

@Injectable()
export class DealershipsService {
  constructor(
    @InjectRepository(Dealership)
    private readonly dealershipRepo: Repository<Dealership>,
  ) {}

  findAll(): Promise<Dealership[]> {
    return this.dealershipRepo.find({ order: { name: "ASC" } });
  }

  findOne(id: string): Promise<Dealership | null> {
    return this.dealershipRepo.findOne({ where: { id } });
  }
}
