/**
 * PEZHWAN — HSM integration module entry point.
 *
 * Provides a unified interface for hardware security module (HSM) and
 * cloud KMS integrations. Choose the appropriate client for your
 * deployment environment:
 *
 *  - Pkcs11Manager: For on-premises HSMs (CloudHSM, Thales, SoftHSM)
 *  - AwsKmsClient:  For AWS KMS / CloudHSM
 *  - AzureKeyVaultClient: For Azure Key Vault / Managed HSM
 *  - GcpKmsClient: For Google Cloud KMS
 */

export {
  Pkcs11Manager,
  createPkcs11Manager,
  type Pkcs11Config,
  type Pkcs11Provider,
  type HsmKeyHandle,
  type HsmSession,
  type Pkcs11SignResult,
  type Pkcs11EncryptResult,
} from './pkcs11.ts';

export {
  AwsKmsClient,
  createAwsKmsClient,
  type AwsKmsConfig,
  type AwsKmsKeyInfo,
  type AwsKmsEncryptResult,
  type AwsKmsDecryptResult,
  type AwsKmsDataKey,
} from './aws-kms.ts';

export {
  AzureKeyVaultClient,
  createAzureKeyVaultClient,
  type AzureKeyVaultConfig,
  type AzureKeyInfo,
  type AzureEncryptResult,
  type AzureDecryptResult,
  type AzureDataKey,
} from './azure-keyvault.ts';

export {
  GcpKmsClient,
  createGcpKmsClient,
  type GcpKmsConfig,
  type GcpKeyInfo,
  type GcpEncryptResult,
  type GcpDecryptResult,
  type GcpDataKey,
} from './gcp-kms.ts';
