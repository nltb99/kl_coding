import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Customer } from "../customers/customer.entity";

@Entity("vehicles")
export class Vehicle {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "customer_id" })
  customerId: string;

  @ManyToOne(() => Customer, (c) => c.vehicles)
  @JoinColumn({ name: "customer_id" })
  customer: Customer;

  @Column({ unique: true })
  vin: string;

  @Column()
  make: string;

  @Column()
  model: string;

  @Column()
  year: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
