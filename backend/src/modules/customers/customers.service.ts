import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Customer } from "./customer.entity";

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  findAll(): Promise<Customer[]> {
    return this.customerRepo.find({ order: { name: "ASC" } });
  }

  findOne(id: string): Promise<Customer | null> {
    return this.customerRepo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<Customer | null> {
    return this.customerRepo.findOne({ where: { email } });
  }

  async upsert(data: Partial<Customer>): Promise<Customer> {
    const existing = data.email ? await this.findByEmail(data.email) : null;
    if (existing) return existing;
    return this.customerRepo.save(this.customerRepo.create(data));
  }
}
