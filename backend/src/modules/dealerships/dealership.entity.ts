import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { Technician } from "../technicians/technician.entity";

@Entity("dealerships")
export class Dealership {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @OneToMany(() => ServiceBay, (bay) => bay.dealership)
  serviceBays: ServiceBay[];

  @OneToMany(() => Technician, (tech) => tech.dealership)
  technicians: Technician[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
