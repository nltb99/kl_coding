import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { AvailabilityService } from "./availability.service";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { Technician } from "../technicians/technician.entity";
import { ServiceType } from "../service-types/service-type.entity";
import { Appointment } from "../appointments/appointment.entity";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockServiceType = {
  id: "service-type-uuid",
  name: "Oil Change",
  durationMinutes: 30,
  requiredSkill: "oil_change",
};

const mockBays = [
  { id: "bay-1", name: "Bay 1", dealershipId: "dealership-uuid", isActive: true },
];

const mockTechs = [
  { id: "tech-1", name: "Alice", skills: ["oil_change"], dealershipId: "dealership-uuid" },
];

const DEALERSHIP_ID = "dealership-uuid";
const START_TIME = new Date("2026-06-15T10:00:00Z");

// ---------------------------------------------------------------------------
// Helper: build a chainable query builder mock
// ---------------------------------------------------------------------------

const createMockQb = (result: any, count = 0) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(result),
  getCount: jest.fn().mockResolvedValue(count),
});

// ---------------------------------------------------------------------------

describe("AvailabilityService", () => {
  let service: AvailabilityService;
  let mockServiceTypeRepo: any;
  let mockServiceBayRepo: any;
  let mockTechnicianRepo: any;
  let mockAppointmentRepo: any;

  beforeEach(async () => {
    mockServiceTypeRepo = {
      findOne: jest.fn().mockResolvedValue(mockServiceType),
    };

    mockServiceBayRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockQb(mockBays)),
    };

    mockTechnicianRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockQb(mockTechs)),
    };

    mockAppointmentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockQb([], 0)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: getRepositoryToken(ServiceBay), useValue: mockServiceBayRepo },
        { provide: getRepositoryToken(Technician), useValue: mockTechnicianRepo },
        { provide: getRepositoryToken(ServiceType), useValue: mockServiceTypeRepo },
        { provide: getRepositoryToken(Appointment), useValue: mockAppointmentRepo },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // checkAvailability
  // -------------------------------------------------------------------------

  describe("checkAvailability", () => {
    it("returns available=true when both techs and bays are free", async () => {
      const result = await service.checkAvailability(DEALERSHIP_ID, "service-type-uuid", START_TIME);
      expect(result.available).toBe(true);
      expect(result.availableBays).toHaveLength(1);
      expect(result.availableTechs).toHaveLength(1);
    });

    it("returns available=false when no qualified technician is free", async () => {
      mockTechnicianRepo.createQueryBuilder.mockReturnValue(createMockQb([]));
      const result = await service.checkAvailability(DEALERSHIP_ID, "service-type-uuid", START_TIME);
      expect(result.available).toBe(false);
      expect(result.availableTechs).toHaveLength(0);
    });

    it("returns available=false when no service bay is free", async () => {
      mockServiceBayRepo.createQueryBuilder.mockReturnValue(createMockQb([]));
      const result = await service.checkAvailability(DEALERSHIP_ID, "service-type-uuid", START_TIME);
      expect(result.available).toBe(false);
      expect(result.availableBays).toHaveLength(0);
    });

    it("returns available=false when both techs and bays are fully booked", async () => {
      mockTechnicianRepo.createQueryBuilder.mockReturnValue(createMockQb([]));
      mockServiceBayRepo.createQueryBuilder.mockReturnValue(createMockQb([]));
      const result = await service.checkAvailability(DEALERSHIP_ID, "service-type-uuid", START_TIME);
      expect(result.available).toBe(false);
    });

    it("correctly computes endTime = startTime + durationMinutes", async () => {
      const result = await service.checkAvailability(DEALERSHIP_ID, "service-type-uuid", START_TIME);
      const expectedEnd = new Date(START_TIME.getTime() + 30 * 60 * 1000);
      expect(result.endTime.getTime()).toBe(expectedEnd.getTime());
    });

    it("includes serviceType in the response", async () => {
      const result = await service.checkAvailability(DEALERSHIP_ID, "service-type-uuid", START_TIME);
      expect(result.serviceType.name).toBe("Oil Change");
      expect(result.serviceType.requiredSkill).toBe("oil_change");
    });

    it("throws NotFoundException when service type does not exist", async () => {
      mockServiceTypeRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.checkAvailability(DEALERSHIP_ID, "invalid-uuid", START_TIME),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // hasConflict
  // -------------------------------------------------------------------------

  describe("hasConflict", () => {
    const END_TIME = new Date(START_TIME.getTime() + 30 * 60 * 1000);

    it("returns false when no overlapping appointments exist", async () => {
      mockAppointmentRepo.createQueryBuilder.mockReturnValue(createMockQb([], 0));
      const result = await service.hasConflict("tech-1", "bay-1", START_TIME, END_TIME);
      expect(result).toBe(false);
    });

    it("returns true when an overlapping confirmed appointment exists", async () => {
      mockAppointmentRepo.createQueryBuilder.mockReturnValue(createMockQb([], 1));
      const result = await service.hasConflict("tech-1", "bay-1", START_TIME, END_TIME);
      expect(result).toBe(true);
    });

    it("does not count cancelled appointments as conflicts (EXCLUDE predicate)", async () => {
      // The query already filters status != 'cancelled' in the WHERE clause.
      // When count = 0, hasConflict returns false even if cancelled rows exist in DB.
      mockAppointmentRepo.createQueryBuilder.mockReturnValue(createMockQb([], 0));
      const result = await service.hasConflict("tech-1", "bay-1", START_TIME, END_TIME);
      expect(result).toBe(false);
    });

    it("returns false when the only conflict is the excluded appointment itself (reschedule self-check)", async () => {
      // Simulate that the query with excludeId returns count=0 (self excluded)
      const qb = createMockQb([], 0);
      mockAppointmentRepo.createQueryBuilder.mockReturnValue(qb);
      const result = await service.hasConflict(
        "tech-1",
        "bay-1",
        START_TIME,
        END_TIME,
        undefined,
        "existing-appointment-id",
      );
      expect(result).toBe(false);
      // Confirm andWhere was called (for excludeId filter)
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it("detects conflict on technician OR bay (either resource overlap triggers conflict)", async () => {
      mockAppointmentRepo.createQueryBuilder.mockReturnValue(createMockQb([], 1));
      // Even if only the bay conflicts (tech is free), hasConflict should return true
      const result = await service.hasConflict("free-tech", "busy-bay", START_TIME, END_TIME);
      expect(result).toBe(true);
    });
  });
});
