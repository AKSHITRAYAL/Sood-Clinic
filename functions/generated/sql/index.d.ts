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

export interface AppointmentLegacySlot_Key {
  appointmentId: UUIDString;
  ordinal: number;
  __typename?: 'AppointmentLegacySlot_Key';
}

export interface AppointmentPrivateDetails_Key {
  appointmentId: UUIDString;
  __typename?: 'AppointmentPrivateDetails_Key';
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

export interface PatientReportedProfile_Key {
  patientId: UUIDString;
  __typename?: 'PatientReportedProfile_Key';
}

export interface Patient_Key {
  id: UUIDString;
  __typename?: 'Patient_Key';
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

