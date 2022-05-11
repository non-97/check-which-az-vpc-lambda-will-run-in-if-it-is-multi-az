import {
  Stack,
  StackProps,
  aws_iam as iam,
  aws_ec2 as ec2,
  aws_logs as logs,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export class VpcLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      cidr: "10.10.0.0/24",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 2,
      maxAzs: 2,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 28 },
        {
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 28,
        },
      ],
    });

    // Lambda Function
    const getNyGlobalIPFunction = new nodejs.NodejsFunction(
      this,
      "GetNyGlobalIPFunction",
      {
        entry: path.join(
          __dirname,
          "../src/lambda/handler/get-my-global-ip-handler.ts"
        ),
        runtime: lambda.Runtime.NODEJS_14_X,
        bundling: {
          minify: true,
          sourceMap: true,
        },
        environment: {
          NODE_OPTIONS: "--enable-source-maps",
        },
        role: new iam.Role(this, "GetNyGlobalIPFunctionIamRole", {
          assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              "service-role/AWSLambdaVPCAccessExecutionRole"
            ),
          ],
        }),
        logRetention: logs.RetentionDays.TWO_WEEKS,
        tracing: lambda.Tracing.ACTIVE,
        vpc,
        vpcSubnets: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        }),
      }
    );

    const createArrayFunction = new nodejs.NodejsFunction(
      this,
      "CreateArrayFunction",
      {
        entry: path.join(
          __dirname,
          "../src/lambda/handler/create-array-handler.ts"
        ),
        runtime: lambda.Runtime.NODEJS_14_X,
        bundling: {
          minify: true,
          sourceMap: true,
        },
        environment: {
          NODE_OPTIONS: "--enable-source-maps",
        },
        logRetention: logs.RetentionDays.TWO_WEEKS,
        tracing: lambda.Tracing.ACTIVE,
      }
    );

    // Step Functions State
    const getNyGlobalIPTask = new tasks.LambdaInvoke(
      this,
      "GetNyGlobalIPTask",
      {
        lambdaFunction: getNyGlobalIPFunction,
        invocationType: tasks.LambdaInvocationType.EVENT,
        payload: sfn.TaskInput.fromObject({
          id: sfn.JsonPath.stringAt("$"),
        }),
        outputPath: "$.StatusCode",
      }
    );

    const createArrayTask = new tasks.LambdaInvoke(this, `CreateArrayTask`, {
      lambdaFunction: createArrayFunction,
      payload: sfn.TaskInput.fromObject({
        number: sfn.JsonPath.stringAt("$.numberForInputMap"),
      }),
    });

    const map = new sfn.Map(this, `MapState`, {
      maxConcurrency: 0,
      itemsPath: sfn.JsonPath.stringAt("$.Payload.array"),
    });

    // State Machine
    new sfn.StateMachine(this, `StateMachine`, {
      definition: createArrayTask
        .next(map.iterator(getNyGlobalIPTask))
        .next(new sfn.Succeed(this, `SuccessState`)),
      tracingEnabled: true,
    });
  }
}
