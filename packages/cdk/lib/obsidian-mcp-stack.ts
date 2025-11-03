import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Point to the repository root for Docker build context (needed for workspace)
const REPO_ROOT = join(__dirname, '..', '..', '..');

const REQUIRED_LAMBDA_ENV_VARS = [
  'VAULT_REPO',
  'VAULT_BRANCH',
  'GIT_TOKEN',
  'JOURNAL_PATH_TEMPLATE',
  'JOURNAL_DATE_FORMAT',
  'JOURNAL_ACTIVITY_SECTION',
  'JOURNAL_FILE_TEMPLATE',
  'OAUTH_CLIENT_ID',
  'OAUTH_CLIENT_SECRET',
  'PERSONAL_AUTH_TOKEN',
  'BASE_URL',
] as const;

const OPTIONAL_LAMBDA_ENV_VARS = ['GIT_USERNAME'] as const;

export class ObsidianMcpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const resolvedEnv = this.resolveRequiredEnv();
    const optionalEnv = this.resolveOptionalEnv();

    const baseEnvironment: Record<string, string> = {
      NODE_ENV: process.env.NODE_ENV ?? 'production',
      ...resolvedEnv,
      ...optionalEnv,
      SESSION_EXPIRY_MS: process.env.SESSION_EXPIRY_MS ?? `${24 * 60 * 60 * 1000}`,
    };

    const logGroup = new logs.LogGroup(this, 'ObsidianMcpLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const TTL_ATTRIBUTE = 'ttl';

    const sessionTable = new dynamodb.Table(this, 'SessionTable', {
      tableName: 'obsidian-mcp-sessions',
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: TTL_ATTRIBUTE,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const mcpFunction = new lambda.DockerImageFunction(this, 'ObsidianMcpFunction', {
      code: lambda.DockerImageCode.fromImageAsset(REPO_ROOT, {
        file: 'packages/app/Dockerfile.lambda',
        platform: cdk.aws_ecr_assets.Platform.LINUX_ARM64,
      }),
      memorySize: 2048, // 2GB
      timeout: cdk.Duration.seconds(60), // 1 minute
      ephemeralStorageSize: cdk.Size.mebibytes(10240), // 10GB for git cache
      environment: {
        ...baseEnvironment,
        SESSION_DYNAMODB_TABLE: sessionTable.tableName,
        SESSION_DYNAMODB_REGION:
          process.env.SESSION_DYNAMODB_REGION ?? props?.env?.region ?? cdk.Stack.of(this).region,
        SESSION_DYNAMODB_TTL_ATTRIBUTE: TTL_ATTRIBUTE,
      },
      logGroup,
      architecture: lambda.Architecture.ARM_64,
    });

    sessionTable.grantReadWriteData(mcpFunction);

    const functionUrl = mcpFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.BUFFERED,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
      },
    });

    new cdk.CfnOutput(this, 'SessionTableName', {
      value: sessionTable.tableName,
      description: 'DynamoDB table storing OAuth sessions',
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
      description: 'MCP Server Function URL',
      exportName: 'ObsidianMcpFunctionUrl',
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: mcpFunction.functionArn,
      description: 'Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'FunctionName', {
      value: mcpFunction.functionName,
      description: 'Lambda Function Name',
    });
  }

  private resolveRequiredEnv(): Record<string, string> {
    const entries = REQUIRED_LAMBDA_ENV_VARS.map(key => {
      const contextValue = this.node.tryGetContext(key) as string | undefined;
      const envValue = process.env[key];
      const value = contextValue ?? envValue;

      if (!value) {
        throw new Error(
          `Missing required environment variable "${key}". ` +
            'Provide it via CDK context (e.g. -c KEY=value) or process env.',
        );
      }

      return [key, String(value)];
    });

    return Object.fromEntries(entries) as Record<string, string>;
  }

  private resolveOptionalEnv(): Record<string, string> {
    const entries = OPTIONAL_LAMBDA_ENV_VARS.map(key => {
      const contextValue = this.node.tryGetContext(key) as string | undefined;
      const envValue = process.env[key];
      const value = contextValue ?? envValue;

      if (value) {
        return [key, String(value)];
      }

      return null;
    }).filter((entry): entry is [string, string] => entry !== null);

    return Object.fromEntries(entries) as Record<string, string>;
  }
}
