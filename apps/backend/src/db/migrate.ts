import fs from 'fs';
import path from 'path';
import { pool } from './client.js';

async function runMigrations() {
  console.log('🔄 Iniciando verificación de migraciones de base de datos...');
  const client = await pool.connect();

  try {
    // 1. Crear tabla de control de migraciones si no existe
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Obtener lista de migraciones ya ejecutadas
    const { rows: executedRows } = await client.query<{ name: string }>(
      'SELECT name FROM schema_migrations'
    );
    const executedMigrations = new Set(executedRows.map((r) => r.name));

    // 3. Leer archivos SQL en el directorio de migraciones
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('ℹ️ No se encontró el directorio de migraciones:', migrationsDir);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (!executedMigrations.has(file)) {
        console.log(`⏳ Aplicando migración: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        // Ejecutar migración dentro de una transacción
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (name) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`✅ Migración aplicada exitosamente: ${file}`);
          appliedCount++;
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`❌ Error fatal aplicando la migración ${file}:`, error);
          throw error;
        }
      } else {
        console.log(`⏭️ Migración ya aplicada previamente: ${file}`);
      }
    }

    if (appliedCount === 0) {
      console.log('✨ La base de datos ya está actualizada. No hay migraciones pendientes.');
    } else {
      console.log(`🎉 Se aplicaron ${appliedCount} migración(es) correctamente.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('❌ Error general en runner de migraciones:', err);
  process.exit(1);
});
