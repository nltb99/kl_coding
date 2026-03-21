import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { getDataSourceToken } from "@nestjs/typeorm";
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { AppointmentsService } from "./appointments.service";
import { Appointment } from "./appointment.entity";
import { Technician } from "../technicians/technician.entity";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { ServiceType } from "../service-types/service-type.entity";
import { AvailabilityService } from "../availability/availability.service";

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockServiceType = {
  id: "service-type-uuid",
  name: "Oil Change",
  durationMinutes: 30,
  requiredSkill: "oil_change",
};

const mockTechnician = {
  id: "tech-uuid",
  name: "Alice",
  skills: ["oil_change"],
  isActive: true,
};

const mockServiceBay = {
  id: "bay-uuid",
  name: "Bay 1",
  isActive: true,
};

const mockAppointment = {
  id: "appointment-uuid",
  status: "confirmed",
  technicianId: "tech-uuid",
  serviceBayId: "bay-uuid",
  serviceTypeId: "service-type-uuid",
  during: {
    start: new Date("2026-07-01T10:00:00Z"),
    end: new Date("2026-07-01T10:30:00Z"),
  },
};

const FUTURE_START = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const validDto = {
  customerId: "customer-uuid",
  vehicleId: "vehicle-uuid",
  technicianId: "tech-uuid",
  serviceBayId: "bay-uuid",
  serviceTypeId: "service-type-uuid",
  startTime: FUTURE_START,
};

// ---------------------------------------------------------------------------
// Helper: build a mock transaction manager
// ---------------------------------------------------------------------------

function buildMockManager(overrides: Partial<{
  technicianResult: any;
  bayResult: any;
  saveResult: any;
  saveFn: jest.Mock;
}> = {}) {
  let callCount = 0;
  // Use 'in' check so null is treated as "return null", not "use default"
  const getOne = jest.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve('technicianResult' in overrides ? overrides.technicianResult : mockTechnician);
    }
    return Promise.resolve('bayResult' in overrides ? overrides.bayResult : mockServiceBay);
  });

  return {
    createQueryBuilder: jest.fn().mockReturnValue({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne,
    }),
    create: jest.fn().mockReturnValue({}),
    save: overrides.saveFn ?? jest.fn().mockResolvedValue(overrides.saveResult ?? {
      id: "appointment-uuid",
      status: "confirmed",
    }),
  };
}

// ---------------------------------------------------------------------------

describe("AppointmentsService", () => {
  let service: AppointmentsService;
  let mockDataSource: any;
  let mockAvailabilityService: any;
  let mockServiceTypeRepo: any;
  let mockAppointmentRepo: any;

  beforeEach(async () => {
    mockAvailabilityService = {
      hasConflict: jest.fn().mockResolvedValue(false),
    };

    const mockManager = buildMockManager();

    mockDataSource = {
      transaction: jest.fn().mockImplementation((_iso, cb) => cb(mockManager)),
    };

    mockServiceTypeRepo = {
      findOne: jest.fn().mockResolvedValue(mockServiceType),
    };

    mockAppointmentRepo = {
      // Return a COPY so service mutations (apt.status = ...) don't corrupt the shared fixture
      findOne: jest.fn().mockResolvedValue({ ...mockAppointment }),
      find: jest.fn(),
      save: jest.fn().mockImplementation((apt) => Promise.resolve({ ...apt })),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Appointment), useValue: mockAppointmentRepo },
        { provide: getRepositoryToken(Technician), useValue: {} },
        { provide: getRepositoryToken(ServiceBay), useValue: {} },
        { provide: getRepositoryToken(ServiceType), useValue: mockServiceTypeRepo },
        { provide: AvailabilityService, useValue: mockAvailabilityService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: "PinoLogger:AppointmentsService", useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // createAppointment
  // -------------------------------------------------------------------------

  describe("createAppointment", () => {
    it("creates appointment successfully and returns confirmed status", async () => {
      const result = await service.createAppointment(validDto);
      expect(result).toHaveProperty("id", "appointment-uuid");
      expect(result).toHaveProperty("status", "confirmed");
    });

    it("throws NotFoundException when service type does not exist", async () => {
      mockServiceTypeRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.createAppointment(validDto)).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when technician does not exist", async () => {
      const manager = buildMockManager({ technicianResult: null });
      mockDataSource.transaction.mockImplementationOnce((_iso: string, cb: Function) => cb(manager));
      await expect(service.createAppointment(validDto)).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when service bay does not exist", async () => {
      const manager = buildMockManager({ bayResult: null });
      mockDataSource.transaction.mockImplementationOnce((_iso: string, cb: Function) => cb(manager));
      await expect(service.createAppointment(validDto)).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when technician lacks the required skill", async () => {
      const wrongSkillTech = { ...mockTechnician, skills: ["brakes"] };
      const manager = buildMockManager({ technicianResult: wrongSkillTech });
      mockDataSource.transaction.mockImplementationOnce((_iso: string, cb: Function) => cb(manager));
      await expect(service.createAppointment(validDto)).rejects.toThrow(BadRequestException);
    });

    it("throws ConflictException when hasConflict returns true (TOCTOU window)", async () => {
      mockAvailabilityService.hasConflict.mockResolvedValueOnce(true);
      await expect(service.createAppointment(validDto)).rejects.toThrow(ConflictException);
    });

    it("throws ConflictException on PostgreSQL EXCLUDE violation (error code 23P01)", async () => {
      const exclusionError = { code: "23P01", detail: "Key conflicts with existing key" };
      const manager = buildMockManager({
        saveFn: jest.fn().mockRejectedValue(exclusionError),
      });
      mockDataSource.transaction.mockImplementationOnce((_iso: string, cb: Function) => cb(manager));
      await expect(service.createAppointment(validDto)).rejects.toThrow(ConflictException);
    });

    it("re-throws unknown errors that are not 23P01", async () => {
      const unknownError = new Error("DB connection lost");
      const manager = buildMockManager({
        saveFn: jest.fn().mockRejectedValue(unknownError),
      });
      mockDataSource.transaction.mockImplementationOnce((_iso: string, cb: Function) => cb(manager));
      await expect(service.createAppointment(validDto)).rejects.toThrow("DB connection lost");
    });

    it("returns cached result when same idempotency key is used twice", async () => {
      const key = "idempotency-key-123";
      const first = await service.createAppointment(validDto, key);
      const second = await service.createAppointment(validDto, key);
      // DataSource.transaction should only be called once
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(first.id).toBe(second.id);
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("cancels a confirmed appointment and sets status to cancelled", async () => {
      const result = await service.cancel("appointment-uuid");
      expect(result.status).toBe("cancelled");
    });

    it("throws NotFoundException when appointment does not exist", async () => {
      mockAppointmentRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.cancel("non-existent")).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when trying to cancel an already-cancelled appointment", async () => {
      mockAppointmentRepo.findOne.mockResolvedValueOnce({ ...mockAppointment, status: "cancelled" });
      await expect(service.cancel("appointment-uuid")).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when trying to cancel a completed appointment", async () => {
      mockAppointmentRepo.findOne.mockResolvedValueOnce({ ...mockAppointment, status: "completed" });
      await expect(service.cancel("appointment-uuid")).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  describe("complete", () => {
    it("completes a confirmed appointment and sets status to completed", async () => {
      const result = await service.complete("appointment-uuid");
      expect(result.status).toBe("completed");
    });

    it("throws NotFoundException when appointment does not exist", async () => {
      mockAppointmentRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.complete("non-existent")).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when trying to complete an already-completed appointment", async () => {
      mockAppointmentRepo.findOne.mockResolvedValueOnce({ ...mockAppointment, status: "completed" });
      await expect(service.complete("appointment-uuid")).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when trying to complete a cancelled appointment", async () => {
      mockAppointmentRepo.findOne.mockResolvedValueOnce({ ...mockAppointment, status: "cancelled" });
      await expect(service.complete("appointment-uuid")).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // reschedule
  // -------------------------------------------------------------------------

  describe("reschedule", () => {
    const rescheduleDto = {
      newStartTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    };

    beforeEach(() => {
      // reschedule uses its own transaction with a 3-call getOne sequence:
      // 1. lock appointment row, 2. lock technician, 3. lock bay
      let callCount = 0;
      const getOne = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ...mockAppointment });
        if (callCount === 2) return Promise.resolve(mockTechnician);
        return Promise.resolve(mockServiceBay);
      });

      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne,
        }),
        save: jest.fn().mockImplementation((apt) => Promise.resolve({ ...apt, id: "appointment-uuid" })),
      };

      mockDataSource.transaction.mockImplementation((_iso: string, cb: Function) => cb(manager));
    });

    it("reschedules successfully and returns updated appointment", async () => {
      const result = await service.reschedule("appointment-uuid", rescheduleDto);
      expect(result).toHaveProperty("id", "appointment-uuid");
    });

    it("throws ConflictException when the new time slot has a conflict", async () => {
      mockAvailabilityService.hasConflict.mockResolvedValueOnce(true);
      await expect(service.reschedule("appointment-uuid", rescheduleDto)).rejects.toThrow(ConflictException);
    });

    it("throws BadRequestException when appointment is not confirmed (already cancelled)", async () => {
      mockAppointmentRepo.findOne.mockResolvedValueOnce({ ...mockAppointment, status: "cancelled" });
      await expect(service.reschedule("appointment-uuid", rescheduleDto)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when technician lacks required skill for reschedule", async () => {
      let callCount = 0;
      const wrongSkillTech = { ...mockTechnician, skills: ["brakes"] };
      const getOne = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ...mockAppointment });
        if (callCount === 2) return Promise.resolve(wrongSkillTech);
        return Promise.resolve(mockServiceBay);
      });
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne,
        }),
        save: jest.fn(),
      };
      mockDataSource.transaction.mockImplementationOnce((_iso: string, cb: Function) => cb(manager));
      await expect(service.reschedule("appointment-uuid", rescheduleDto)).rejects.toThrow(BadRequestException);
    });

    it("throws ConflictException on 23P01 during reschedule save", async () => {
      const exclusionError = { code: "23P01", detail: "Key conflicts" };
      let callCount = 0;
      const getOne = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ...mockAppointment });
        if (callCount === 2) return Promise.resolve(mockTechnician);
        return Promise.resolve(mockServiceBay);
      });
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne,
        }),
        save: jest.fn().mockRejectedValue(exclusionError),
      };
      mockDataSource.transaction.mockImplementationOnce((_iso: string, cb: Function) => cb(manager));
      await expect(service.reschedule("appointment-uuid", rescheduleDto)).rejects.toThrow(ConflictException);
    });
  });
});
