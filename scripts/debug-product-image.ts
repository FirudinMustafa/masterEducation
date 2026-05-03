import "dotenv/config";
import pg from "pg";

const SLUG = process.argv[2] ?? "juegos-de-tablero-y-tarjetas-65681";
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url });

async function main() {
  await c.connect();
  const r = await c.query(
    `SELECT p."nopId", p.name, p.slug, p."hasImage", pi.filename, pi."pictureId", pi."displayOrder"
     FROM products p LEFT JOIN product_images pi ON pi."productId" = p.id
     WHERE p.slug = $1
     ORDER BY pi."displayOrder"`,
    [SLUG]
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
