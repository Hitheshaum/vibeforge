"use strict";
/**
 * Shared types and interfaces for VibeForge platform
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeploymentError = exports.AssumeRoleError = exports.BedrockAccessError = exports.Environment = exports.Blueprint = void 0;
var Blueprint;
(function (Blueprint) {
    Blueprint["SERVERLESS"] = "serverless";
    Blueprint["CONTAINERS"] = "containers";
})(Blueprint || (exports.Blueprint = Blueprint = {}));
var Environment;
(function (Environment) {
    Environment["DEV"] = "dev";
    Environment["PROD"] = "prod";
})(Environment || (exports.Environment = Environment = {}));
class BedrockAccessError extends Error {
    region;
    modelId;
    constructor(region, modelId, message) {
        super(message ||
            `Access denied to Bedrock model in ${region}. For Anthropic models, first-time users may need to submit use case details. Go to AWS Console → Bedrock → Model catalog, select ${modelId}, and try it in the playground to complete setup.`);
        this.region = region;
        this.modelId = modelId;
        this.name = 'BedrockAccessError';
    }
}
exports.BedrockAccessError = BedrockAccessError;
class AssumeRoleError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AssumeRoleError';
    }
}
exports.AssumeRoleError = AssumeRoleError;
class DeploymentError extends Error {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
        this.name = 'DeploymentError';
    }
}
exports.DeploymentError = DeploymentError;
