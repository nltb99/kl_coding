import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateServiceBays1700000004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE service_bays (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id UUID NOT NULL REFERENCES dealerships(id),
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_service_bays_dealership ON service_bays(dealership_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS service_bays`);
  }
}
