
class MysqlHelpers {
  static async saveRecord(db, tablename, data) {
    const kvs = Object.entries(data)
    const colnames = kvs.map(([k, ]) => k)
    const values = kvs.map(([, v]) => v)

    const cplaceholders_sql = colnames.map(_ => '??').join(', ')
    const vplaceholders_sql = values.map(_ => '?').join(', ')

    await db.query(`insert into ?? (${cplaceholders_sql}) values (${vplaceholders_sql})`,
      [tablename, ...colnames, ...values])
  }


  static async countRecords(db, tablename) {
    const [[c], ] = await db.query('select count(1) as count from ??', [tablename])
    return c.count
  }
}


export default MysqlHelpers
