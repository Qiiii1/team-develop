import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { HttpError } from './http.mjs';
import { progressFields, progressText, validateTeamReferences } from './domain.mjs';

export function createDraftStore(file) {
  let queue = Promise.resolve();
  async function read() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { drafts: [] }; throw error; }
  }
  function mutate(work) {
    const result = queue.then(async () => {
      const data = await read();
      const value = await work(data);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
      return value;
    });
    queue = result.catch(() => {});
    return result;
  }
  function editable(data, id, revision) {
    const draft = data.drafts.find(item => item.id === id);
    if (!draft) throw new HttpError(404, '草稿不存在');
    if (draft.revision !== revision) throw new HttpError(409, '草稿已在另一页面更新，请重新打开');
    if (draft.publishedAt) throw new HttpError(409, '这份进展已经发布');
    return draft;
  }
  return {
    async list() { await queue; return (await read()).drafts; },
    create(input, source = 'manual') {
      return mutate(data => {
        const draft = { id: randomUUID(), revision: 1, ...progressFields(input, { allowEmpty: true }), source, createdAt: new Date().toISOString(), publishedAt: null };
        data.drafts.push(draft);
        return draft;
      });
    },
    save(id, revision, input) {
      return mutate(data => {
        const draft = editable(data, id, revision);
        Object.assign(draft, progressFields(input, { allowEmpty: true }), { revision: draft.revision + 1 });
        return draft;
      });
    },
    publish(id, revision, client) {
      return mutate(async data => {
        const draft = editable(data, id, revision);
        const value = progressFields(draft);
        const state = await client.state();
        if (!state.connected) throw new HttpError(401, '请先关联团队');
        validateTeamReferences(state.team, state.memberId, value, true);
        const result = await client.publish({ ...value, text: progressText(value), kind: 'progress', publicationId: draft.id });
        Object.assign(draft, { revision: draft.revision + 1, publishedAt: result.update.createdAt, publishedUpdateId: result.update.id });
        return { draft, update: result.update };
      });
    },
  };
}
