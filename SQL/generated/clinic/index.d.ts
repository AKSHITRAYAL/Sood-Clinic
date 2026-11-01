import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise } from 'firebase/data-connect';

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

export interface GetOwnSqlProfileData {
  user?: {
    id: string;
    displayName: string;
    active: boolean;
  } & User_Key;
}

export interface GetPublicClinicContactData {
  clinicProfile?: {
    name: string;
    phone: string;
    email: string;
    address: string;
    timezone: string;
  };
}

export interface GetPublicClinicData {
  clinicProfile?: {
    name: string;
    phone: string;
    email: string;
    address: string;
    timezone: string;
  };
  branches: ({
    id: UUIDString;
    code: string;
    name: string;
    address: string;
    timezone: string;
  } & Branch_Key)[];
  departments: ({
    id: UUIDString;
    name: string;
    branch: {
      id: UUIDString;
    } & Branch_Key;
  } & Department_Key)[];
  doctors: ({
    id: UUIDString;
    name: string;
    qualification?: string | null;
    registrationNumber: string;
    bio?: string | null;
    photoPath?: string | null;
    branch: {
      id: UUIDString;
    } & Branch_Key;
  } & Doctor_Key)[];
  services: ({
    id: UUIDString;
    code: string;
    name: string;
    durationMinutes: number;
    bufferMinutes: number;
    feePaise?: number | null;
    consultationMode: string;
  } & Service_Key)[];
}

export interface GetPublicDoctorHoursData {
  doctors: ({
    legacyId?: string | null;
    name: string;
    branch: {
      timezone: string;
    };
    state?: {
      authority: string;
      updatedAt?: TimestampString | null;
    };
    weekly: ({
      startMinute: number;
      endMinute: number;
    })[];
    exceptions: ({
      date: DateString;
      kind: string;
      sessions: ({
        startMinute: number;
        endMinute: number;
      })[];
    })[];
  })[];
}

export interface GetPublicDoctorHoursVariables {
  doctorLegacyId: string;
  date: DateString;
  weekday: number;
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

export interface SaveOwnSqlProfileData {
  user_upsert: User_Key;
  operationReceipt_insert: OperationReceipt_Key;
  auditLog_insert: AuditLog_Key;
}

export interface SaveOwnSqlProfileVariables {
  displayName: string;
  requestId: UUIDString;
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

interface GetPublicClinicRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetPublicClinicData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetPublicClinicData, undefined>;
  operationName: string;
}
export const getPublicClinicRef: GetPublicClinicRef;

export function getPublicClinic(options?: ExecuteQueryOptions): QueryPromise<GetPublicClinicData, undefined>;
export function getPublicClinic(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetPublicClinicData, undefined>;

interface GetOwnSqlProfileRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetOwnSqlProfileData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetOwnSqlProfileData, undefined>;
  operationName: string;
}
export const getOwnSqlProfileRef: GetOwnSqlProfileRef;

export function getOwnSqlProfile(options?: ExecuteQueryOptions): QueryPromise<GetOwnSqlProfileData, undefined>;
export function getOwnSqlProfile(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetOwnSqlProfileData, undefined>;

interface GetPublicClinicContactRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetPublicClinicContactData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetPublicClinicContactData, undefined>;
  operationName: string;
}
export const getPublicClinicContactRef: GetPublicClinicContactRef;

export function getPublicClinicContact(options?: ExecuteQueryOptions): QueryPromise<GetPublicClinicContactData, undefined>;
export function getPublicClinicContact(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetPublicClinicContactData, undefined>;

interface GetPublicDoctorHoursRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetPublicDoctorHoursVariables): QueryRef<GetPublicDoctorHoursData, GetPublicDoctorHoursVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetPublicDoctorHoursVariables): QueryRef<GetPublicDoctorHoursData, GetPublicDoctorHoursVariables>;
  operationName: string;
}
export const getPublicDoctorHoursRef: GetPublicDoctorHoursRef;

export function getPublicDoctorHours(vars: GetPublicDoctorHoursVariables, options?: ExecuteQueryOptions): QueryPromise<GetPublicDoctorHoursData, GetPublicDoctorHoursVariables>;
export function getPublicDoctorHours(dc: DataConnect, vars: GetPublicDoctorHoursVariables, options?: ExecuteQueryOptions): QueryPromise<GetPublicDoctorHoursData, GetPublicDoctorHoursVariables>;

interface SaveOwnSqlProfileRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: SaveOwnSqlProfileVariables): MutationRef<SaveOwnSqlProfileData, SaveOwnSqlProfileVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: SaveOwnSqlProfileVariables): MutationRef<SaveOwnSqlProfileData, SaveOwnSqlProfileVariables>;
  operationName: string;
}
export const saveOwnSqlProfileRef: SaveOwnSqlProfileRef;

export function saveOwnSqlProfile(vars: SaveOwnSqlProfileVariables): MutationPromise<SaveOwnSqlProfileData, SaveOwnSqlProfileVariables>;
export function saveOwnSqlProfile(dc: DataConnect, vars: SaveOwnSqlProfileVariables): MutationPromise<SaveOwnSqlProfileData, SaveOwnSqlProfileVariables>;

