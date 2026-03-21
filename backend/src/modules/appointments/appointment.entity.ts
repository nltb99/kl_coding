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
import { Vehicle } from "../vehicles/vehicle.entity";
import { Technician } from "../technicians/technician.entity";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { ServiceType } from "../service-types/service-type.entity";

// Transformer to handle tsrange <-> { start, end } conversion
export const tsRangeTransformer = {
  to: (value: { start: Date; end: Date }): string => {
    if (!value) return null;
    return `[${value.start.toISOString()},${value.end.toISOString()})`;
  },
  from: (value: string): { start: Date; end: Date } => {
    if (!value) return null;
    // Parse `["2026-03-20 10:00:00","2026-03-20 10:30:00")` — timestamps may be quoted
    const match = value.match(/[\[(]"?([^",]+)"?,"?([^",)]+)"?[)\]]/);
    if (!match) return null;
    return {
      start: new Date(match[1]),
      end: new Date(match[2]),
    };
  },
};

@Entity("appointments")
export class Appointment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "customer_id" })
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: "customer_id" })
  customer: Customer;

  @Column({ name: "vehicle_id" })
  vehicleId: string;

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: "vehicle_id" })
  vehicle: Vehicle;

  @Column({ name: "technician_id" })
  technicianId: string;

  @ManyToOne(() => Technician)
  @JoinColumn({ name: "technician_id" })
  technician: Technician;

  @Column({ name: "service_bay_id" })
  serviceBayId: string;

  @ManyToOne(() => ServiceBay)
  @JoinColumn({ name: "service_bay_id" })
  serviceBay: ServiceBay;

  @Column({ name: "service_type_id" })
  serviceTypeId: string;

  @ManyToOne(() => ServiceType)
  @JoinColumn({ name: "service_type_id" })
  serviceType: ServiceType;

  @Column({
    type: "tsrange",
    transformer: tsRangeTransformer,
  })
  during: { start: Date; end: Date };

  @Column({ default: "confirmed" })
  status: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
