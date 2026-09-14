export default function handler(
  _request: unknown,
  response: { status: (code: number) => { json: (body: unknown) => void } },
) {
  response.status(200).json({ data: { ok: true, diagnostic: "entrypoint" } });
}
