import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAppointments1700000008000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE appointments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES customers(id),
        vehicle_id UUID NOT NULL REFERENCES vehicles(id),
        technician_id UUID NOT NULL REFERENCES technicians(id),
        service_bay_id UUID NOT NULL REFERENCES service_bays(id),
        service_type_id UUID NOT NULL REFERENCES service_types(id),
        during TSRANGE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT no_technician_overlap
          EXCLUDE USING gist (technician_id WITH =, during WITH &&)
          WHERE (status != 'cancelled'),

        CONSTRAINT no_service_bay_overlap
          EXCLUDE USING gist (service_bay_id WITH =, during WITH &&)
          WHERE (status != 'cancelled')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_appointments_customer ON appointments(customer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_appointments_status ON appointments(status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS appointments`);
  }
}
