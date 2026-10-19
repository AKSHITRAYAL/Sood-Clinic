# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `clinic`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetPublicClinic*](#getpublicclinic)
  - [*GetOwnSqlProfile*](#getownsqlprofile)
  - [*GetPublicClinicContact*](#getpubliccliniccontact)
- [**Mutations**](#mutations)
  - [*SaveOwnSqlProfile*](#saveownsqlprofile)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `clinic`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@clinic/sql-client` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@clinic/sql-client';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@clinic/sql-client';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `clinic` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetPublicClinic
You can execute the `GetPublicClinic` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [clinic/index.d.ts](./index.d.ts):
```typescript
getPublicClinic(options?: ExecuteQueryOptions): QueryPromise<GetPublicClinicData, undefined>;

interface GetPublicClinicRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetPublicClinicData, undefined>;
}
export const getPublicClinicRef: GetPublicClinicRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getPublicClinic(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetPublicClinicData, undefined>;

interface GetPublicClinicRef {
  ...
  (dc: DataConnect): QueryRef<GetPublicClinicData, undefined>;
}
export const getPublicClinicRef: GetPublicClinicRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getPublicClinicRef:
```typescript
const name = getPublicClinicRef.operationName;
console.log(name);
```

### Variables
The `GetPublicClinic` query has no variables.
### Return Type
Recall that executing the `GetPublicClinic` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetPublicClinicData`, which is defined in [clinic/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetPublicClinic`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getPublicClinic } from '@clinic/sql-client';


// Call the `getPublicClinic()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getPublicClinic();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getPublicClinic(dataConnect);

console.log(data.clinicProfile);
console.log(data.branches);
console.log(data.departments);
console.log(data.doctors);
console.log(data.services);

// Or, you can use the `Promise` API.
getPublicClinic().then((response) => {
  const data = response.data;
  console.log(data.clinicProfile);
  console.log(data.branches);
  console.log(data.departments);
  console.log(data.doctors);
  console.log(data.services);
});
```

### Using `GetPublicClinic`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getPublicClinicRef } from '@clinic/sql-client';


// Call the `getPublicClinicRef()` function to get a reference to the query.
const ref = getPublicClinicRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getPublicClinicRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.clinicProfile);
console.log(data.branches);
console.log(data.departments);
console.log(data.doctors);
console.log(data.services);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.clinicProfile);
  console.log(data.branches);
  console.log(data.departments);
  console.log(data.doctors);
  console.log(data.services);
});
```

## GetOwnSqlProfile
You can execute the `GetOwnSqlProfile` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [clinic/index.d.ts](./index.d.ts):
```typescript
getOwnSqlProfile(options?: ExecuteQueryOptions): QueryPromise<GetOwnSqlProfileData, undefined>;

interface GetOwnSqlProfileRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetOwnSqlProfileData, undefined>;
}
export const getOwnSqlProfileRef: GetOwnSqlProfileRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getOwnSqlProfile(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetOwnSqlProfileData, undefined>;

interface GetOwnSqlProfileRef {
  ...
  (dc: DataConnect): QueryRef<GetOwnSqlProfileData, undefined>;
}
export const getOwnSqlProfileRef: GetOwnSqlProfileRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getOwnSqlProfileRef:
```typescript
const name = getOwnSqlProfileRef.operationName;
console.log(name);
```

### Variables
The `GetOwnSqlProfile` query has no variables.
### Return Type
Recall that executing the `GetOwnSqlProfile` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetOwnSqlProfileData`, which is defined in [clinic/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetOwnSqlProfileData {
  user?: {
    id: string;
    displayName: string;
    active: boolean;
  } & User_Key;
}
```
### Using `GetOwnSqlProfile`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getOwnSqlProfile } from '@clinic/sql-client';


// Call the `getOwnSqlProfile()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getOwnSqlProfile();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getOwnSqlProfile(dataConnect);

console.log(data.user);

// Or, you can use the `Promise` API.
getOwnSqlProfile().then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

### Using `GetOwnSqlProfile`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getOwnSqlProfileRef } from '@clinic/sql-client';


// Call the `getOwnSqlProfileRef()` function to get a reference to the query.
const ref = getOwnSqlProfileRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getOwnSqlProfileRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.user);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

## GetPublicClinicContact
You can execute the `GetPublicClinicContact` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [clinic/index.d.ts](./index.d.ts):
```typescript
getPublicClinicContact(options?: ExecuteQueryOptions): QueryPromise<GetPublicClinicContactData, undefined>;

interface GetPublicClinicContactRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetPublicClinicContactData, undefined>;
}
export const getPublicClinicContactRef: GetPublicClinicContactRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getPublicClinicContact(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetPublicClinicContactData, undefined>;

interface GetPublicClinicContactRef {
  ...
  (dc: DataConnect): QueryRef<GetPublicClinicContactData, undefined>;
}
export const getPublicClinicContactRef: GetPublicClinicContactRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getPublicClinicContactRef:
```typescript
const name = getPublicClinicContactRef.operationName;
console.log(name);
```

### Variables
The `GetPublicClinicContact` query has no variables.
### Return Type
Recall that executing the `GetPublicClinicContact` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetPublicClinicContactData`, which is defined in [clinic/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetPublicClinicContactData {
  clinicProfile?: {
    name: string;
    phone: string;
    email: string;
    address: string;
    timezone: string;
  };
}
```
### Using `GetPublicClinicContact`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getPublicClinicContact } from '@clinic/sql-client';


// Call the `getPublicClinicContact()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getPublicClinicContact();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getPublicClinicContact(dataConnect);

console.log(data.clinicProfile);

// Or, you can use the `Promise` API.
getPublicClinicContact().then((response) => {
  const data = response.data;
  console.log(data.clinicProfile);
});
```

### Using `GetPublicClinicContact`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getPublicClinicContactRef } from '@clinic/sql-client';


// Call the `getPublicClinicContactRef()` function to get a reference to the query.
const ref = getPublicClinicContactRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getPublicClinicContactRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.clinicProfile);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.clinicProfile);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `clinic` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## SaveOwnSqlProfile
You can execute the `SaveOwnSqlProfile` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [clinic/index.d.ts](./index.d.ts):
```typescript
saveOwnSqlProfile(vars: SaveOwnSqlProfileVariables): MutationPromise<SaveOwnSqlProfileData, SaveOwnSqlProfileVariables>;

interface SaveOwnSqlProfileRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: SaveOwnSqlProfileVariables): MutationRef<SaveOwnSqlProfileData, SaveOwnSqlProfileVariables>;
}
export const saveOwnSqlProfileRef: SaveOwnSqlProfileRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
saveOwnSqlProfile(dc: DataConnect, vars: SaveOwnSqlProfileVariables): MutationPromise<SaveOwnSqlProfileData, SaveOwnSqlProfileVariables>;

interface SaveOwnSqlProfileRef {
  ...
  (dc: DataConnect, vars: SaveOwnSqlProfileVariables): MutationRef<SaveOwnSqlProfileData, SaveOwnSqlProfileVariables>;
}
export const saveOwnSqlProfileRef: SaveOwnSqlProfileRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the saveOwnSqlProfileRef:
```typescript
const name = saveOwnSqlProfileRef.operationName;
console.log(name);
```

### Variables
The `SaveOwnSqlProfile` mutation requires an argument of type `SaveOwnSqlProfileVariables`, which is defined in [clinic/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface SaveOwnSqlProfileVariables {
  displayName: string;
  requestId: UUIDString;
}
```
### Return Type
Recall that executing the `SaveOwnSqlProfile` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SaveOwnSqlProfileData`, which is defined in [clinic/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface SaveOwnSqlProfileData {
  user_upsert: User_Key;
  operationReceipt_insert: OperationReceipt_Key;
  auditLog_insert: AuditLog_Key;
}
```
### Using `SaveOwnSqlProfile`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, saveOwnSqlProfile, SaveOwnSqlProfileVariables } from '@clinic/sql-client';

// The `SaveOwnSqlProfile` mutation requires an argument of type `SaveOwnSqlProfileVariables`:
const saveOwnSqlProfileVars: SaveOwnSqlProfileVariables = {
  displayName: ..., 
  requestId: ..., 
};

// Call the `saveOwnSqlProfile()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await saveOwnSqlProfile(saveOwnSqlProfileVars);
// Variables can be defined inline as well.
const { data } = await saveOwnSqlProfile({ displayName: ..., requestId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await saveOwnSqlProfile(dataConnect, saveOwnSqlProfileVars);

console.log(data.user_upsert);
console.log(data.operationReceipt_insert);
console.log(data.auditLog_insert);

// Or, you can use the `Promise` API.
saveOwnSqlProfile(saveOwnSqlProfileVars).then((response) => {
  const data = response.data;
  console.log(data.user_upsert);
  console.log(data.operationReceipt_insert);
  console.log(data.auditLog_insert);
});
```

### Using `SaveOwnSqlProfile`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, saveOwnSqlProfileRef, SaveOwnSqlProfileVariables } from '@clinic/sql-client';

// The `SaveOwnSqlProfile` mutation requires an argument of type `SaveOwnSqlProfileVariables`:
const saveOwnSqlProfileVars: SaveOwnSqlProfileVariables = {
  displayName: ..., 
  requestId: ..., 
};

// Call the `saveOwnSqlProfileRef()` function to get a reference to the mutation.
const ref = saveOwnSqlProfileRef(saveOwnSqlProfileVars);
// Variables can be defined inline as well.
const ref = saveOwnSqlProfileRef({ displayName: ..., requestId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = saveOwnSqlProfileRef(dataConnect, saveOwnSqlProfileVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_upsert);
console.log(data.operationReceipt_insert);
console.log(data.auditLog_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_upsert);
  console.log(data.operationReceipt_insert);
  console.log(data.auditLog_insert);
});
```

