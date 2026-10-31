import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface AbortStaffAccessChangeData {
  auditLog_insert: AuditLog_Key;
  staffAccessLock_delete?: StaffAccessLock_Key | null;
}

export interface AbortStaffAccessChangeVariables {
  requestId: UUIDString;
  actorUid: string;
  actorRole: string;
  targetUid: string;
}

export interface AcceptPatientLinkInvitationData {
  patientLinkInvitation_deleteMany: number;
  patientLink_insert: PatientLink_Key;
  auditLog_insert: AuditLog_Key;
}

export interface AcceptPatientLinkInvitationVariables {
  patientId: UUIDString;
  targetUid: string;
  tokenHash: string;
  relationship: string;
  verifiedBy: string;
  resourceId: string;
}

export interface AppointmentEvent_Key {
  id: UUIDString;
  __typename?: 'AppointmentEvent_Key';
}

export interface Appointment_Key {
  id: UUIDString;
  __typename?: 'Appointment_Key';
}

export interface AuditLog_Key {
  id: UUIDString;
  __typename?: 'AuditLog_Key';
}

export interface BeginStaffAccessChangeData {
  staffAccessLock_insert: StaffAccessLock_Key;
  auditLog_insert: AuditLog_Key;
}

export interface BeginStaffAccessChangeVariables {
  requestId: UUIDString;
  actorUid: string;
  actorRole: string;
  action: string;
  targetUid: string;
}

export interface Branch_Key {
  id: UUIDString;
  __typename?: 'Branch_Key';
}

export interface CheckSqlFoundationData {
  clinicProfile?: {
    id: string;
    name: string;
    timezone: string;
  } & ClinicProfile_Key;
}

export interface ClinicProfile_Key {
  id: string;
  __typename?: 'ClinicProfile_Key';
}

export interface ClinicSettings_Key {
  id: string;
  __typename?: 'ClinicSettings_Key';
}

export interface ConsumePatientLinkAttemptData {
  user_updateMany: number;
  auditLog_insert: AuditLog_Key;
}

export interface ConsumePatientLinkAttemptVariables {
  actorUid: string;
}

export interface CreateBookingServiceData {
  clinicSettings_updateMany: number;
  service_insert: Service_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface CreateBookingServiceVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  id: UUIDString;
  legacyId: string;
  name: string;
  durationMinutes: number;
  consultationMode: string;
  active: boolean;
  sortOrder: number;
}

export interface CreateCatalogueBranchData {
  branch_insert: Branch_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface CreateCatalogueBranchVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  name: string;
  active: boolean;
  code: string;
  address: string;
}

export interface CreateCatalogueDepartmentData {
  department_insert: Department_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface CreateCatalogueDepartmentVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  name: string;
  active: boolean;
  branchId: UUIDString;
  code: string;
  description: string;
  sortOrder: number;
  publicBookingEnabled: boolean;
}

export interface CreateCatalogueDoctorData {
  doctor_insert: Doctor_Key;
  doctorDepartment_deleteMany: number;
  member0: DoctorDepartment_Key;
  member1: DoctorDepartment_Key;
  member2: DoctorDepartment_Key;
  member3: DoctorDepartment_Key;
  member4: DoctorDepartment_Key;
  member5: DoctorDepartment_Key;
  member6: DoctorDepartment_Key;
  member7: DoctorDepartment_Key;
  member8: DoctorDepartment_Key;
  member9: DoctorDepartment_Key;
  member10: DoctorDepartment_Key;
  member11: DoctorDepartment_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface CreateCatalogueDoctorVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  name: string;
  active: boolean;
  branchId: UUIDString;
  qualification: string;
  registrationNumber: string;
  bookingEnabled: boolean;
  departmentIds: UUIDString[];
  member0: boolean;
  member1: boolean;
  member2: boolean;
  member3: boolean;
  member4: boolean;
  member5: boolean;
  member6: boolean;
  member7: boolean;
  member8: boolean;
  member9: boolean;
  member10: boolean;
  member11: boolean;
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

export interface FindPatientLinkInvitationData {
  patientLinkInvitations: ({
    patientId: UUIDString;
    userId: string;
    relationship: string;
    verifiedBy: string;
  } & PatientLinkInvitation_Key)[];
}

export interface FindPatientLinkInvitationVariables {
  tokenHash: string;
  targetUid: string;
}

export interface FinishStaffAccessChangeData {
  user_upsert: User_Key;
  staffProfile_upsert: StaffProfile_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
  staffAccessLock_delete?: StaffAccessLock_Key | null;
}

export interface FinishStaffAccessChangeVariables {
  requestId: UUIDString;
  actorUid: string;
  actorRole: string;
  action: string;
  uid: string;
  name: string;
  email: string;
  role: string;
  doctorLegacyId?: string | null;
  accountActive: boolean;
  active: boolean;
  requiresPasswordChange: boolean;
  sessionValidAfterSeconds: Int64String;
}

export interface GetAdminClinicContactData {
  clinicProfile?: {
    name: string;
    phone: string;
    email: string;
    address: string;
    timezone: string;
    updatedAt: TimestampString;
  };
}

export interface GetBookingSettingsReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface GetBookingSettingsReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface GetCatalogueReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface GetCatalogueReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface GetClinicContactReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface GetClinicContactReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface ImportPublicClinicContactData {
  clinicProfile_upsert: ClinicProfile_Key;
  auditLog_insert: AuditLog_Key;
}

export interface ImportPublicClinicContactVariables {
  name: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
}

export interface InspectStaffAccessChangeData {
  auditLog?: {
    id: UUIDString;
    actorUid?: string | null;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string;
    occurredAt: TimestampString;
  } & AuditLog_Key;
}

export interface InspectStaffAccessChangeVariables {
  requestId: UUIDString;
}

export interface InspectStaffAccessLockData {
  staffAccessLock?: {
    requestId: UUIDString;
    actorUid: string;
    createdAt: TimestampString;
  };
}

export interface IssuePatientLinkInvitationData {
  patientLinkInvitation_upsert: PatientLinkInvitation_Key;
  auditLog_insert: AuditLog_Key;
}

export interface IssuePatientLinkInvitationVariables {
  patientId: UUIDString;
  targetUid: string;
  tokenHash: string;
  relationship: string;
  evidence: string;
  actorUid: string;
  actorRole: string;
  expiresAt: TimestampString;
  resourceId: string;
}

export interface ListStaffAuditData {
  auditLogs: ({
    id: UUIDString;
    actorUid?: string | null;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string;
    occurredAt: TimestampString;
  } & AuditLog_Key)[];
}

export interface ListStaffAuditVariables {
  limit: number;
}

export interface ListStaffIdentityPageData {
  staffProfiles: ({
    user: {
      id: string;
      displayName: string;
      active: boolean;
    } & User_Key;
    email: string;
    role: string;
    doctorLegacyId?: string | null;
    sessionValidAfterSeconds: Int64String;
    active: boolean;
    requiresPasswordChange: boolean;
  })[];
}

export interface ListStaffIdentityPageVariables {
  afterUid: string;
  limit: number;
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

export interface Patient_Key {
  id: UUIDString;
  __typename?: 'Patient_Key';
}

export interface ReadAdminAuditLogAfterData {
  user_updateMany: number;
  query?: {
    auditLogs: ({
      id: UUIDString;
      actorUid?: string | null;
      actorRole: string;
      action: string;
      resourceType: string;
      resourceId: string;
      occurredAt: TimestampString;
    } & AuditLog_Key)[];
  };
  auditLog_insert: AuditLog_Key;
}

export interface ReadAdminAuditLogAfterVariables {
  actorUid: string;
  actorRole: string;
  afterOccurredAt: TimestampString;
}

export interface ReadAdminAuditLogData {
  user_updateMany: number;
  query?: {
    auditLogs: ({
      id: UUIDString;
      actorUid?: string | null;
      actorRole: string;
      action: string;
      resourceType: string;
      resourceId: string;
      occurredAt: TimestampString;
    } & AuditLog_Key)[];
  };
  auditLog_insert: AuditLog_Key;
}

export interface ReadAdminAuditLogVariables {
  actorUid: string;
  actorRole: string;
}

export interface ReadBookingSettingsData {
  clinicSettings?: {
    id: string;
    bookingWindowDays: number;
    leadMinutes: number;
    intervalMinutes?: number | null;
    bufferBeforeMinutes?: number | null;
    bufferAfterMinutes?: number | null;
    cancelCutoffMinutes: number;
    autoConfirm: boolean;
    updatedAt: TimestampString;
  } & ClinicSettings_Key;
  services: ({
    id: UUIDString;
    legacyId?: string | null;
    code: string;
    name: string;
    durationMinutes: number;
    bufferMinutes: number;
    consultationMode: string;
    active: boolean;
    legacySortOrder?: number | null;
    updatedAt: TimestampString;
  } & Service_Key)[];
}

export interface ReadSqlCatalogueData {
  branches: ({
    id: UUIDString;
    legacyId?: string | null;
    code: string;
    name: string;
    address: string;
    timezone: string;
    active: boolean;
    updatedAt: TimestampString;
  } & Branch_Key)[];
  departments: ({
    id: UUIDString;
    legacyId?: string | null;
    branchId: UUIDString;
    code: string;
    name: string;
    description?: string | null;
    active: boolean;
    publicBookingEnabled: boolean;
    sortOrder: number;
    updatedAt: TimestampString;
  } & Department_Key)[];
  doctors: ({
    id: UUIDString;
    legacyId?: string | null;
    branchId: UUIDString;
    name: string;
    qualification?: string | null;
    registrationNumber: string;
    active: boolean;
    bookingEnabled: boolean;
    updatedAt: TimestampString;
  } & Doctor_Key)[];
  doctorDepartments: ({
    doctorId: UUIDString;
    departmentId: UUIDString;
    sortOrder?: number | null;
  } & DoctorDepartment_Key)[];
}

export interface RevokePatientLinkData {
  patientLinkInvitation_deleteMany: number;
  patientLink_deleteMany: number;
  auditLog_insert: AuditLog_Key;
}

export interface RevokePatientLinkVariables {
  patientId: UUIDString;
  targetUid: string;
  actorUid: string;
  actorRole: string;
  resourceId: string;
}

export interface SaveBookingSettingsData {
  clinicSettings_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveBookingSettingsVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  bookingWindowDays: number;
  leadMinutes: number;
  intervalMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  cancelCutoffMinutes: number;
  autoConfirm: boolean;
}

export interface SaveClinicContactData {
  clinicProfile_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveClinicContactVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  name: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
}

export interface ScheduleException_Key {
  id: UUIDString;
  __typename?: 'ScheduleException_Key';
}

export interface SeedFoundationData {
  clinicProfile_upsert: ClinicProfile_Key;
  branch_upsert: Branch_Key;
  department_upsert: Department_Key;
  doctor_upsert: Doctor_Key;
  doctorDepartment_upsert: DoctorDepartment_Key;
  service_upsert: Service_Key;
  doctorService_upsert: DoctorService_Key;
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

export interface UpdateBookingServiceData {
  clinicSettings_updateMany: number;
  service_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface UpdateBookingServiceVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  id: UUIDString;
  legacyId: string;
  name: string;
  durationMinutes: number;
  consultationMode: string;
  active: boolean;
  expectedServiceUpdatedAt: TimestampString;
}

export interface UpdateCatalogueBranchData {
  branch_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface UpdateCatalogueBranchVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  expectedUpdatedAt: TimestampString;
  name: string;
  active: boolean;
  code: string;
  address: string;
}

export interface UpdateCatalogueDepartmentData {
  department_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface UpdateCatalogueDepartmentVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  expectedUpdatedAt: TimestampString;
  name: string;
  active: boolean;
  branchId: UUIDString;
  code: string;
  description: string;
  sortOrder: number;
  publicBookingEnabled: boolean;
}

export interface UpdateCatalogueDoctorData {
  doctor_updateMany: number;
  doctorDepartment_deleteMany: number;
  member0: DoctorDepartment_Key;
  member1: DoctorDepartment_Key;
  member2: DoctorDepartment_Key;
  member3: DoctorDepartment_Key;
  member4: DoctorDepartment_Key;
  member5: DoctorDepartment_Key;
  member6: DoctorDepartment_Key;
  member7: DoctorDepartment_Key;
  member8: DoctorDepartment_Key;
  member9: DoctorDepartment_Key;
  member10: DoctorDepartment_Key;
  member11: DoctorDepartment_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface UpdateCatalogueDoctorVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  expectedUpdatedAt: TimestampString;
  name: string;
  active: boolean;
  branchId: UUIDString;
  qualification: string;
  registrationNumber: string;
  bookingEnabled: boolean;
  departmentIds: UUIDString[];
  member0: boolean;
  member1: boolean;
  member2: boolean;
  member3: boolean;
  member4: boolean;
  member5: boolean;
  member6: boolean;
  member7: boolean;
  member8: boolean;
  member9: boolean;
  member10: boolean;
  member11: boolean;
}

export interface UpsertStaffIdentityData {
  user_upsert: User_Key;
  staffProfile_upsert: StaffProfile_Key;
  auditLog_insert: AuditLog_Key;
}

export interface UpsertStaffIdentityVariables {
  uid: string;
  name: string;
  email: string;
  role: string;
  doctorLegacyId?: string | null;
  accountActive: boolean;
  active: boolean;
  requiresPasswordChange: boolean;
  sessionValidAfterSeconds: Int64String;
  actorUid: string;
}

export interface User_Key {
  id: string;
  __typename?: 'User_Key';
}

/** Generated Node Admin SDK operation action function for the 'ReadAdminAuditLog' Mutation. Allow users to execute without passing in DataConnect. */
export function readAdminAuditLog(dc: DataConnect, vars: ReadAdminAuditLogVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadAdminAuditLogData>>;
/** Generated Node Admin SDK operation action function for the 'ReadAdminAuditLog' Mutation. Allow users to pass in custom DataConnect instances. */
export function readAdminAuditLog(vars: ReadAdminAuditLogVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadAdminAuditLogData>>;

/** Generated Node Admin SDK operation action function for the 'ReadAdminAuditLogAfter' Mutation. Allow users to execute without passing in DataConnect. */
export function readAdminAuditLogAfter(dc: DataConnect, vars: ReadAdminAuditLogAfterVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadAdminAuditLogAfterData>>;
/** Generated Node Admin SDK operation action function for the 'ReadAdminAuditLogAfter' Mutation. Allow users to pass in custom DataConnect instances. */
export function readAdminAuditLogAfter(vars: ReadAdminAuditLogAfterVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadAdminAuditLogAfterData>>;

/** Generated Node Admin SDK operation action function for the 'ReadBookingSettings' Query. Allow users to execute without passing in DataConnect. */
export function readBookingSettings(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadBookingSettingsData>>;
/** Generated Node Admin SDK operation action function for the 'ReadBookingSettings' Query. Allow users to pass in custom DataConnect instances. */
export function readBookingSettings(options?: OperationOptions): Promise<ExecuteOperationResponse<ReadBookingSettingsData>>;

/** Generated Node Admin SDK operation action function for the 'GetBookingSettingsReceipt' Query. Allow users to execute without passing in DataConnect. */
export function getBookingSettingsReceipt(dc: DataConnect, vars: GetBookingSettingsReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetBookingSettingsReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'GetBookingSettingsReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function getBookingSettingsReceipt(vars: GetBookingSettingsReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetBookingSettingsReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'SaveBookingSettings' Mutation. Allow users to execute without passing in DataConnect. */
export function saveBookingSettings(dc: DataConnect, vars: SaveBookingSettingsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveBookingSettingsData>>;
/** Generated Node Admin SDK operation action function for the 'SaveBookingSettings' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveBookingSettings(vars: SaveBookingSettingsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveBookingSettingsData>>;

/** Generated Node Admin SDK operation action function for the 'CreateBookingService' Mutation. Allow users to execute without passing in DataConnect. */
export function createBookingService(dc: DataConnect, vars: CreateBookingServiceVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateBookingServiceData>>;
/** Generated Node Admin SDK operation action function for the 'CreateBookingService' Mutation. Allow users to pass in custom DataConnect instances. */
export function createBookingService(vars: CreateBookingServiceVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateBookingServiceData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateBookingService' Mutation. Allow users to execute without passing in DataConnect. */
export function updateBookingService(dc: DataConnect, vars: UpdateBookingServiceVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateBookingServiceData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateBookingService' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateBookingService(vars: UpdateBookingServiceVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateBookingServiceData>>;

/** Generated Node Admin SDK operation action function for the 'ReadSqlCatalogue' Query. Allow users to execute without passing in DataConnect. */
export function readSqlCatalogue(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadSqlCatalogueData>>;
/** Generated Node Admin SDK operation action function for the 'ReadSqlCatalogue' Query. Allow users to pass in custom DataConnect instances. */
export function readSqlCatalogue(options?: OperationOptions): Promise<ExecuteOperationResponse<ReadSqlCatalogueData>>;

/** Generated Node Admin SDK operation action function for the 'GetCatalogueReceipt' Query. Allow users to execute without passing in DataConnect. */
export function getCatalogueReceipt(dc: DataConnect, vars: GetCatalogueReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCatalogueReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'GetCatalogueReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function getCatalogueReceipt(vars: GetCatalogueReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCatalogueReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'CreateCatalogueBranch' Mutation. Allow users to execute without passing in DataConnect. */
export function createCatalogueBranch(dc: DataConnect, vars: CreateCatalogueBranchVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueBranchData>>;
/** Generated Node Admin SDK operation action function for the 'CreateCatalogueBranch' Mutation. Allow users to pass in custom DataConnect instances. */
export function createCatalogueBranch(vars: CreateCatalogueBranchVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueBranchData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueBranch' Mutation. Allow users to execute without passing in DataConnect. */
export function updateCatalogueBranch(dc: DataConnect, vars: UpdateCatalogueBranchVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueBranchData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueBranch' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateCatalogueBranch(vars: UpdateCatalogueBranchVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueBranchData>>;

/** Generated Node Admin SDK operation action function for the 'CreateCatalogueDepartment' Mutation. Allow users to execute without passing in DataConnect. */
export function createCatalogueDepartment(dc: DataConnect, vars: CreateCatalogueDepartmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueDepartmentData>>;
/** Generated Node Admin SDK operation action function for the 'CreateCatalogueDepartment' Mutation. Allow users to pass in custom DataConnect instances. */
export function createCatalogueDepartment(vars: CreateCatalogueDepartmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueDepartmentData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueDepartment' Mutation. Allow users to execute without passing in DataConnect. */
export function updateCatalogueDepartment(dc: DataConnect, vars: UpdateCatalogueDepartmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueDepartmentData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueDepartment' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateCatalogueDepartment(vars: UpdateCatalogueDepartmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueDepartmentData>>;

/** Generated Node Admin SDK operation action function for the 'CreateCatalogueDoctor' Mutation. Allow users to execute without passing in DataConnect. */
export function createCatalogueDoctor(dc: DataConnect, vars: CreateCatalogueDoctorVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueDoctorData>>;
/** Generated Node Admin SDK operation action function for the 'CreateCatalogueDoctor' Mutation. Allow users to pass in custom DataConnect instances. */
export function createCatalogueDoctor(vars: CreateCatalogueDoctorVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueDoctorData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueDoctor' Mutation. Allow users to execute without passing in DataConnect. */
export function updateCatalogueDoctor(dc: DataConnect, vars: UpdateCatalogueDoctorVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueDoctorData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueDoctor' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateCatalogueDoctor(vars: UpdateCatalogueDoctorVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueDoctorData>>;

/** Generated Node Admin SDK operation action function for the 'GetAdminClinicContact' Query. Allow users to execute without passing in DataConnect. */
export function getAdminClinicContact(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<GetAdminClinicContactData>>;
/** Generated Node Admin SDK operation action function for the 'GetAdminClinicContact' Query. Allow users to pass in custom DataConnect instances. */
export function getAdminClinicContact(options?: OperationOptions): Promise<ExecuteOperationResponse<GetAdminClinicContactData>>;

/** Generated Node Admin SDK operation action function for the 'GetClinicContactReceipt' Query. Allow users to execute without passing in DataConnect. */
export function getClinicContactReceipt(dc: DataConnect, vars: GetClinicContactReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetClinicContactReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'GetClinicContactReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function getClinicContactReceipt(vars: GetClinicContactReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetClinicContactReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'SaveClinicContact' Mutation. Allow users to execute without passing in DataConnect. */
export function saveClinicContact(dc: DataConnect, vars: SaveClinicContactVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveClinicContactData>>;
/** Generated Node Admin SDK operation action function for the 'SaveClinicContact' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveClinicContact(vars: SaveClinicContactVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveClinicContactData>>;

/** Generated Node Admin SDK operation action function for the 'CheckSqlFoundation' Query. Allow users to execute without passing in DataConnect. */
export function checkSqlFoundation(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<CheckSqlFoundationData>>;
/** Generated Node Admin SDK operation action function for the 'CheckSqlFoundation' Query. Allow users to pass in custom DataConnect instances. */
export function checkSqlFoundation(options?: OperationOptions): Promise<ExecuteOperationResponse<CheckSqlFoundationData>>;

/** Generated Node Admin SDK operation action function for the 'ImportPublicClinicContact' Mutation. Allow users to execute without passing in DataConnect. */
export function importPublicClinicContact(dc: DataConnect, vars: ImportPublicClinicContactVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ImportPublicClinicContactData>>;
/** Generated Node Admin SDK operation action function for the 'ImportPublicClinicContact' Mutation. Allow users to pass in custom DataConnect instances. */
export function importPublicClinicContact(vars: ImportPublicClinicContactVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ImportPublicClinicContactData>>;

/** Generated Node Admin SDK operation action function for the 'SeedFoundation' Mutation. Allow users to execute without passing in DataConnect. */
export function seedFoundation(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<SeedFoundationData>>;
/** Generated Node Admin SDK operation action function for the 'SeedFoundation' Mutation. Allow users to pass in custom DataConnect instances. */
export function seedFoundation(options?: OperationOptions): Promise<ExecuteOperationResponse<SeedFoundationData>>;

/** Generated Node Admin SDK operation action function for the 'ConsumePatientLinkAttempt' Mutation. Allow users to execute without passing in DataConnect. */
export function consumePatientLinkAttempt(dc: DataConnect, vars: ConsumePatientLinkAttemptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ConsumePatientLinkAttemptData>>;
/** Generated Node Admin SDK operation action function for the 'ConsumePatientLinkAttempt' Mutation. Allow users to pass in custom DataConnect instances. */
export function consumePatientLinkAttempt(vars: ConsumePatientLinkAttemptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ConsumePatientLinkAttemptData>>;

/** Generated Node Admin SDK operation action function for the 'IssuePatientLinkInvitation' Mutation. Allow users to execute without passing in DataConnect. */
export function issuePatientLinkInvitation(dc: DataConnect, vars: IssuePatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<IssuePatientLinkInvitationData>>;
/** Generated Node Admin SDK operation action function for the 'IssuePatientLinkInvitation' Mutation. Allow users to pass in custom DataConnect instances. */
export function issuePatientLinkInvitation(vars: IssuePatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<IssuePatientLinkInvitationData>>;

/** Generated Node Admin SDK operation action function for the 'FindPatientLinkInvitation' Query. Allow users to execute without passing in DataConnect. */
export function findPatientLinkInvitation(dc: DataConnect, vars: FindPatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<FindPatientLinkInvitationData>>;
/** Generated Node Admin SDK operation action function for the 'FindPatientLinkInvitation' Query. Allow users to pass in custom DataConnect instances. */
export function findPatientLinkInvitation(vars: FindPatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<FindPatientLinkInvitationData>>;

/** Generated Node Admin SDK operation action function for the 'AcceptPatientLinkInvitation' Mutation. Allow users to execute without passing in DataConnect. */
export function acceptPatientLinkInvitation(dc: DataConnect, vars: AcceptPatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AcceptPatientLinkInvitationData>>;
/** Generated Node Admin SDK operation action function for the 'AcceptPatientLinkInvitation' Mutation. Allow users to pass in custom DataConnect instances. */
export function acceptPatientLinkInvitation(vars: AcceptPatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AcceptPatientLinkInvitationData>>;

/** Generated Node Admin SDK operation action function for the 'RevokePatientLink' Mutation. Allow users to execute without passing in DataConnect. */
export function revokePatientLink(dc: DataConnect, vars: RevokePatientLinkVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<RevokePatientLinkData>>;
/** Generated Node Admin SDK operation action function for the 'RevokePatientLink' Mutation. Allow users to pass in custom DataConnect instances. */
export function revokePatientLink(vars: RevokePatientLinkVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<RevokePatientLinkData>>;

/** Generated Node Admin SDK operation action function for the 'ListStaffIdentityPage' Query. Allow users to execute without passing in DataConnect. */
export function listStaffIdentityPage(dc: DataConnect, vars: ListStaffIdentityPageVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListStaffIdentityPageData>>;
/** Generated Node Admin SDK operation action function for the 'ListStaffIdentityPage' Query. Allow users to pass in custom DataConnect instances. */
export function listStaffIdentityPage(vars: ListStaffIdentityPageVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListStaffIdentityPageData>>;

/** Generated Node Admin SDK operation action function for the 'BeginStaffAccessChange' Mutation. Allow users to execute without passing in DataConnect. */
export function beginStaffAccessChange(dc: DataConnect, vars: BeginStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<BeginStaffAccessChangeData>>;
/** Generated Node Admin SDK operation action function for the 'BeginStaffAccessChange' Mutation. Allow users to pass in custom DataConnect instances. */
export function beginStaffAccessChange(vars: BeginStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<BeginStaffAccessChangeData>>;

/** Generated Node Admin SDK operation action function for the 'FinishStaffAccessChange' Mutation. Allow users to execute without passing in DataConnect. */
export function finishStaffAccessChange(dc: DataConnect, vars: FinishStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<FinishStaffAccessChangeData>>;
/** Generated Node Admin SDK operation action function for the 'FinishStaffAccessChange' Mutation. Allow users to pass in custom DataConnect instances. */
export function finishStaffAccessChange(vars: FinishStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<FinishStaffAccessChangeData>>;

/** Generated Node Admin SDK operation action function for the 'AbortStaffAccessChange' Mutation. Allow users to execute without passing in DataConnect. */
export function abortStaffAccessChange(dc: DataConnect, vars: AbortStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AbortStaffAccessChangeData>>;
/** Generated Node Admin SDK operation action function for the 'AbortStaffAccessChange' Mutation. Allow users to pass in custom DataConnect instances. */
export function abortStaffAccessChange(vars: AbortStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AbortStaffAccessChangeData>>;

/** Generated Node Admin SDK operation action function for the 'ListStaffAudit' Query. Allow users to execute without passing in DataConnect. */
export function listStaffAudit(dc: DataConnect, vars: ListStaffAuditVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListStaffAuditData>>;
/** Generated Node Admin SDK operation action function for the 'ListStaffAudit' Query. Allow users to pass in custom DataConnect instances. */
export function listStaffAudit(vars: ListStaffAuditVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListStaffAuditData>>;

/** Generated Node Admin SDK operation action function for the 'InspectStaffAccessLock' Query. Allow users to execute without passing in DataConnect. */
export function inspectStaffAccessLock(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<InspectStaffAccessLockData>>;
/** Generated Node Admin SDK operation action function for the 'InspectStaffAccessLock' Query. Allow users to pass in custom DataConnect instances. */
export function inspectStaffAccessLock(options?: OperationOptions): Promise<ExecuteOperationResponse<InspectStaffAccessLockData>>;

/** Generated Node Admin SDK operation action function for the 'InspectStaffAccessChange' Query. Allow users to execute without passing in DataConnect. */
export function inspectStaffAccessChange(dc: DataConnect, vars: InspectStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<InspectStaffAccessChangeData>>;
/** Generated Node Admin SDK operation action function for the 'InspectStaffAccessChange' Query. Allow users to pass in custom DataConnect instances. */
export function inspectStaffAccessChange(vars: InspectStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<InspectStaffAccessChangeData>>;

/** Generated Node Admin SDK operation action function for the 'UpsertStaffIdentity' Mutation. Allow users to execute without passing in DataConnect. */
export function upsertStaffIdentity(dc: DataConnect, vars: UpsertStaffIdentityVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpsertStaffIdentityData>>;
/** Generated Node Admin SDK operation action function for the 'UpsertStaffIdentity' Mutation. Allow users to pass in custom DataConnect instances. */
export function upsertStaffIdentity(vars: UpsertStaffIdentityVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpsertStaffIdentityData>>;

