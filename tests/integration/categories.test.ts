import { describe, expect, it } from "vitest";
import { HTTP_BASE_URL } from "./globalSetup";

/**
 * Phase 6's acceptance clause: a user can rename a system category and move a
 * series into a category of their own, the change persists across sessions, and
 * no other user sees it. The last part is what the overlay design of Section
 * 9.1 exists for, so it is checked with a second account rather than asserted.
 */

interface Client {
  cookie: string | null;
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

function client(): Client {
  const c: Client = {
    cookie: null,
    async fetch(path, init = {}) {
      const headers = new Headers(init.headers);
      if (c.cookie) headers.set("cookie", c.cookie);
      const res = await fetch(`${HTTP_BASE_URL}${path}`, { ...init, headers, redirect: "manual" });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) c.cookie = setCookie.split(";")[0] ?? c.cookie;
      return res;
    },
  };
  return c;
}

interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  isSystem: boolean;
  isOverride: boolean;
  seriesCount: number;
  children: CategoryNode[];
}

async function signUp(c: Client): Promise<{ email: string; password: string }> {
  const email = `cat-${Math.random().toString(36).slice(2, 10)}@drdash.test`;
  const password = "IntegrationPass!2026";
  const res = await c.fetch("/api/v1/auth/sign-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, name: "Category Person", password }),
  });
  expect(res.status).toBe(201);
  return { email, password };
}

async function tree(c: Client): Promise<CategoryNode[]> {
  const res = await c.fetch("/api/v1/categories?tree=1");
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: CategoryNode[] }).data;
}

function find(nodes: CategoryNode[], slug: string): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const inChildren = find(node.children, slug);
    if (inChildren) return inChildren;
  }
  return undefined;
}

describe("category overlays", () => {
  it("keeps one user's edits invisible to another", async () => {
    const alice = client();
    const { email, password } = await signUp(alice);

    const before = await tree(alice);
    const labor = find(before, "labor-market");
    expect(labor?.isSystem).toBe(true);
    expect(labor?.isOverride).toBe(false);
    const seriesCountBefore = labor?.seriesCount ?? 0;
    expect(seriesCountBefore).toBeGreaterThan(0);

    // Rename a built-in category. This creates Alice's overlay behind the scenes.
    const renamed = await alice.fetch(`/api/v1/categories/${labor?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Jobs and wages" }),
    });
    expect(renamed.status).toBe(200);

    const afterRename = await tree(alice);
    const overlay = find(afterRename, "labor-market");
    expect(overlay?.name).toBe("Jobs and wages");
    expect(overlay?.isOverride).toBe(true);
    // The overlay starts as a copy of the system membership, so renaming a
    // category must not appear to empty it.
    expect(overlay?.seriesCount).toBe(seriesCountBefore);

    // Make a category of her own and move a series into it.
    const created = await alice.fetch("/api/v1/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "My teaching set" }),
    });
    expect(created.status).toBe(201);
    const mine = ((await created.json()) as { data: { id: string } }).data;

    const detail = await alice.fetch("/api/v1/series/UNRATE");
    const unrate = ((await detail.json()) as { data: { id: string } }).data;

    const linked = await alice.fetch(`/api/v1/categories/${mine.id}/series`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seriesId: unrate.id }),
    });
    expect(linked.status).toBe(201);

    // Removing a series from a category never deletes the series.
    const removed = await alice.fetch(
      `/api/v1/categories/${overlay?.id}/series?seriesId=${unrate.id}`,
      { method: "DELETE" },
    );
    expect(removed.status).toBe(204);
    expect((await alice.fetch("/api/v1/series/UNRATE")).status).toBe(200);

    const afterMove = await tree(alice);
    expect(find(afterMove, "my-teaching-set")?.seriesCount).toBe(1);
    expect(find(afterMove, "labor-market")?.seriesCount).toBe(seriesCountBefore - 1);

    // It persists across sessions: a fresh sign-in sees the same tree.
    const returning = client();
    const back = await returning.fetch("/api/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(back.status).toBe(200);
    expect(find(await tree(returning), "labor-market")?.name).toBe("Jobs and wages");

    // And a second account sees none of it.
    const bob = client();
    await signUp(bob);
    const bobsTree = await tree(bob);
    const bobsLabor = find(bobsTree, "labor-market");

    expect(bobsLabor?.name).toBe("Labor Market");
    expect(bobsLabor?.isOverride).toBe(false);
    expect(bobsLabor?.seriesCount).toBe(seriesCountBefore);
    expect(find(bobsTree, "my-teaching-set")).toBeUndefined();
  });

  it("refuses to delete a built-in category", async () => {
    const c = client();
    await signUp(c);

    const housing = find(await tree(c), "housing");
    const res = await c.fetch(`/api/v1/categories/${housing?.id}`, { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SYSTEM_CATEGORY");
  });

  it("refuses to nest more than three levels deep", async () => {
    const c = client();
    await signUp(c);

    const make = async (name: string, parentId?: string) => {
      const res = await c.fetch("/api/v1/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });
      return { status: res.status, body: (await res.json()) as { data?: { id: string } } };
    };

    const first = await make(`L1 ${Math.random().toString(36).slice(2, 8)}`);
    const second = await make("L2", first.body.data?.id);
    const third = await make("L3", second.body.data?.id);
    expect(third.status).toBe(201);

    const fourth = await make("L4", third.body.data?.id);
    expect(fourth.status).toBe(422);
  });
});
