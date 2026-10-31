# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { getPublicClinic, getOwnSqlProfile, getPublicClinicContact, saveOwnSqlProfile } from '@clinic/sql-client';


// Operation GetPublicClinic: 
const { data } = await GetPublicClinic(dataConnect);

// Operation GetOwnSqlProfile: 
const { data } = await GetOwnSqlProfile(dataConnect);

// Operation GetPublicClinicContact: 
const { data } = await GetPublicClinicContact(dataConnect);

// Operation SaveOwnSqlProfile:  For variables, look at type SaveOwnSqlProfileVars in ../index.d.ts
const { data } = await SaveOwnSqlProfile(dataConnect, saveOwnSqlProfileVars);


```