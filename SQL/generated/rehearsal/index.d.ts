import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface AppointmentEvent_Key {
  id: UUIDString;
  __typename?: 'AppointmentEvent_Key';
}

export interface AppointmentIntake_Key {
  appointmentId: UUIDString;
  questionId: string;
  __typename?: 'AppointmentIntake_Key';
}

export interface AppointmentLegacySlot_Key {
  appointmentId: UUIDString;
  ordinal: number;
  __typename?: 'AppointmentLegacySlot_Key';
}

export interface AppointmentPrivateDetails_Key {
  appointmentId: UUIDString;
  __typename?: 'AppointmentPrivateDetails_Key';
}

export interface AppointmentUnit_Key {
  unitKey: string;
  __typename?: 'AppointmentUnit_Key';
}

export interface Appointment_Key {
  id: UUIDString;
  __typename?: 'Appointment_Key';
}

export interface AuditLog_Key {
  id: UUIDString;
  __typename?: 'AuditLog_Key';
}

export interface Branch_Key {
  id: UUIDString;
  __typename?: 'Branch_Key';
}

export interface CalendarBlock_Key {
  id: UUIDString;
  __typename?: 'CalendarBlock_Key';
}

export interface CalendarFeed_Key {
  doctorId: UUIDString;
  __typename?: 'CalendarFeed_Key';
}

export interface ClinicProfile_Key {
  id: string;
  __typename?: 'ClinicProfile_Key';
}

export interface ClinicSettings_Key {
  id: string;
  __typename?: 'ClinicSettings_Key';
}

export interface DayTokenCounter_Key {
  doctorId: UUIDString;
  dayKey: string;
  __typename?: 'DayTokenCounter_Key';
}

export interface Department_Key {
  id: UUIDString;
  __typename?: 'Department_Key';
}

export interface DoctorDepartment_Key {
  doctorId: UUIDString;
  departmentId: UUIDString;
  __typename?: 'DoctorDepartment_Key';
}

export interface DoctorScheduleState_Key {
  doctorId: UUIDString;
  __typename?: 'DoctorScheduleState_Key';
}

export interface DoctorSchedule_Key {
  id: UUIDString;
  __typename?: 'DoctorSchedule_Key';
}

export interface DoctorService_Key {
  doctorId: UUIDString;
  serviceId: UUIDString;
  __typename?: 'DoctorService_Key';
}

export interface Doctor_Key {
  id: UUIDString;
  __typename?: 'Doctor_Key';
}

export interface ExceptionWindow_Key {
  id: UUIDString;
  __typename?: 'ExceptionWindow_Key';
}

export interface InspectBranchRehearsalData {
  branch?: {
    name: string;
    updatedAt: TimestampString;
    code: string;
    active: boolean;
  };
  legacySourceInstant?: {
    sqlValue: TimestampString;
    exactValue: string;
    sourcePath: string;
  };
  operationReceipt?: {
    operation: string;
  };
  auditLog?: {
    action: string;
    actorUid?: string | null;
    actorRole: string;
    resourceId: string;
    resourceType: string;
  };
}

export interface InspectBranchRehearsalVariables {
  requestId: UUIDString;
}

export interface LegacyAuditRecord_Key {
  id: UUIDString;
  __typename?: 'LegacyAuditRecord_Key';
}

export interface LegacyBookingRequest_Key {
  id: UUIDString;
  __typename?: 'LegacyBookingRequest_Key';
}

export interface LegacyMedicalDocument_Key {
  id: UUIDString;
  __typename?: 'LegacyMedicalDocument_Key';
}

export interface LegacyMedicalHistory_Key {
  id: UUIDString;
  __typename?: 'LegacyMedicalHistory_Key';
}

export interface LegacyPatientFeedback_Key {
  id: UUIDString;
  __typename?: 'LegacyPatientFeedback_Key';
}

export interface LegacySourceInstant_Key {
  entityType: string;
  entityId: string;
  field: string;
  __typename?: 'LegacySourceInstant_Key';
}

export interface LegacyUhidCounter_Key {
  id: UUIDString;
  __typename?: 'LegacyUhidCounter_Key';
}

export interface Notification_Key {
  id: UUIDString;
  __typename?: 'Notification_Key';
}

export interface OperationReceipt_Key {
  actorUid: string;
  requestId: UUIDString;
  __typename?: 'OperationReceipt_Key';
}

export interface PatientLinkInvitation_Key {
  patientId: UUIDString;
  userId: string;
  __typename?: 'PatientLinkInvitation_Key';
}

export interface PatientLink_Key {
  patientId: UUIDString;
  userId: string;
  __typename?: 'PatientLink_Key';
}

export interface PatientReportedProfile_Key {
  patientId: UUIDString;
  __typename?: 'PatientReportedProfile_Key';
}

export interface Patient_Key {
  id: UUIDString;
  __typename?: 'Patient_Key';
}

export interface RehearseBranchCompareAndSetData {
  branch_updateMany: number;
  legacySourceInstant_upsert: LegacySourceInstant_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface RehearseBranchCompareAndSetVariables {
  requestId: UUIDString;
  expectedName: string;
  expectedAt: TimestampString;
  name: string;
  updatedAt: TimestampString;
  exactValue: string;
  operation: string;
  action: string;
}

export interface ScheduleException_Key {
  id: UUIDString;
  __typename?: 'ScheduleException_Key';
}

export interface Service_Key {
  id: UUIDString;
  __typename?: 'Service_Key';
}

export interface StaffAccessLock_Key {
  id: string;
  __typename?: 'StaffAccessLock_Key';
}

export interface StaffProfile_Key {
  userId: string;
  __typename?: 'StaffProfile_Key';
}

export interface User_Key {
  id: string;
  __typename?: 'User_Key';
}

export interface WaitlistEntry_Key {
  id: UUIDString;
  __typename?: 'WaitlistEntry_Key';
}

/** Generated Node Admin SDK operation action function for the 'RehearseBranchCompareAndSet' Mutation. Allow users to execute without passing in DataConnect. */
export function rehearseBranchCompareAndSet(dc: DataConnect, vars: RehearseBranchCompareAndSetVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<RehearseBranchCompareAndSetData>>;
/** Generated Node Admin SDK operation action function for the 'RehearseBranchCompareAndSet' Mutation. Allow users to pass in custom DataConnect instances. */
export function rehearseBranchCompareAndSet(vars: RehearseBranchCompareAndSetVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<RehearseBranchCompareAndSetData>>;

/** Generated Node Admin SDK operation action function for the 'InspectBranchRehearsal' Query. Allow users to execute without passing in DataConnect. */
export function inspectBranchRehearsal(dc: DataConnect, vars: InspectBranchRehearsalVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<InspectBranchRehearsalData>>;
/** Generated Node Admin SDK operation action function for the 'InspectBranchRehearsal' Query. Allow users to pass in custom DataConnect instances. */
export function inspectBranchRehearsal(vars: InspectBranchRehearsalVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<InspectBranchRehearsalData>>;

