import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { createRequireSession } from "./require-session";

type FakeResponse = {
  statusCode: number | null;
  body: unknown;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
};

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: null,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function fakeRequest(authorization?: string): Request {
  return {
    headers: authorization === undefined ? {} : { authorization },
    log: { error: () => {} },
  } as unknown as Request;
}

async function run(verify: (token: string) => Promise<boolean>, authorization?: string) {
  const requireSession = createRequireSession(verify);
  const res = fakeResponse();
  const next = mock.fn();
  await requireSession(fakeRequest(authorization), res as unknown as Response, next as unknown as NextFunction);
  return { res, next };
}

describe("createRequireSession", () => {
  it("denies requests without an Authorization header and never calls the verifier", async () => {
    const verify = mock.fn(async () => true);
    const { res, next } = await run(verify, undefined);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
    assert.equal(verify.mock.callCount(), 0);
  });

  it("denies non-Bearer authorization schemes", async () => {
    const verify = mock.fn(async () => true);
    const { res, next } = await run(verify, "Basic dXNlcjpwYXNz");
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
    assert.equal(verify.mock.callCount(), 0);
  });

  it("denies a token the verifier rejects", async () => {
    const { res, next } = await run(async () => false, "Bearer expired-token");
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
  });

  it("fails closed with 503 when verification throws", async () => {
    const { res, next } = await run(async () => {
      throw new Error("auth service unreachable");
    }, "Bearer some-token");
    assert.equal(res.statusCode, 503);
    assert.equal(next.mock.callCount(), 0);
    assert.doesNotMatch(JSON.stringify(res.body), /unreachable/);
  });

  it("passes the request on when the token is valid", async () => {
    const verify = mock.fn(async (token: string) => token === "good-token");
    const { res, next } = await run(verify, "Bearer good-token");
    assert.equal(next.mock.callCount(), 1);
    assert.equal(res.statusCode, null);
    assert.equal(verify.mock.calls[0].arguments[0], "good-token");
  });
});
