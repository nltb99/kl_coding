import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTechnicians1700000005000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE technicians (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id UUID NOT NULL REFERENCES dealerships(id),
        name VARCHAR(255) NOT NULL,
        skills TEXT[] NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_technicians_dealership ON technicians(dealership_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS technicians`);
  }
}
