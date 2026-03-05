import * as fs from "fs";
import * as path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockApi } from "./setup";
import { registerGatewayMethods } from "../src/gateway/wellknown";

function createMockResponse() {
  let statusCode = 200;
  let jsonBody: any;
  const headers = new Map<string, string>();

  return {
    response: {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonBody = data;
      },
      send(data: string) {
        jsonBody = data;
      },
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
      },
    },
    get statusCode() {
      return statusCode;
    },
    get jsonBody() {
      return jsonBody;
    },
    get headers() {
      return headers;
    },
  };
}

describe("A2A gateway endpoints", () => {
  const homeDir = "/tmp/test-home";
  const jacsDir = path.join(homeDir, ".openclaw", "jacs");
  const keysDir = path.join(homeDir, ".openclaw", "jacs_keys");
  const agentDir = path.join(jacsDir, "agent");
  const configPath = path.join(jacsDir, "jacs.config.json");

  beforeEach(() => {
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(keysDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        jacs_agent_id_and_version: "test-agent-id:1",
        jacs_data_directory: "./",
        jacs_agent_public_key_filename: "jacs.public.pem",
      }),
    );
    fs.writeFileSync(
      path.join(keysDir, "jacs.public.pem"),
      "-----BEGIN PUBLIC KEY-----\nmock-public-key-pem\n-----END PUBLIC KEY-----\n",
    );
    fs.writeFileSync(
      path.join(agentDir, "test-agent-id:1.json"),
      JSON.stringify({
        jacsId: "test-agent-id",
        jacsVersion: "1",
        jacsType: "agent",
      }),
    );
  });

  it("serves /.well-known/agent-card.json", async () => {
    const api = createMockApi({
      initialized: true,
      agentId: "test-agent-id",
      agentName: "Gateway Agent",
      agentDomain: "gateway.example.com",
    });
    registerGatewayMethods(api);

    const route = api.registeredGatewayMethods.get("/.well-known/agent-card.json");
    const res = createMockResponse();

    await route.handler({ method: "GET", path: "/.well-known/agent-card.json" }, res.response);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.name).toBe("Gateway Agent");
    expect(res.jsonBody.metadata.jacsId).toBe("test-agent-id");
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("serves /.well-known/jwks.json", async () => {
    const api = createMockApi({
      initialized: true,
      agentId: "test-agent-id",
      agentName: "Gateway Agent",
      agentDomain: "gateway.example.com",
    });
    registerGatewayMethods(api);

    const route = api.registeredGatewayMethods.get("/.well-known/jwks.json");
    const res = createMockResponse();

    await route.handler({ method: "GET", path: "/.well-known/jwks.json" }, res.response);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.jsonBody.keys)).toBe(true);
    expect(res.jsonBody.keys[0].kid).toBe("test-agent-id");
  });

  it("serves /jacs/agent from local agent storage", async () => {
    const api = createMockApi({
      initialized: true,
      agentId: "test-agent-id",
      agentName: "Gateway Agent",
      agentDomain: "gateway.example.com",
    });
    registerGatewayMethods(api);

    const route = api.registeredGatewayMethods.get("/jacs/agent");
    const res = createMockResponse();

    await route.handler({ method: "GET", path: "/jacs/agent" }, res.response);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.jacsId).toBe("test-agent-id");
    expect(res.jsonBody.jacsType).toBe("agent");
  });
});

