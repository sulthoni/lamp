import os
import json
from typing import Dict, List
from flask import send_file
from utils import Config
from connections import (
    get_mysql_connection,
    get_mssql_connection,
)

config = Config()

def load_table_structure(file_path: str) -> List[Dict]:
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            return json.load(f)
    return []

def save_table_structure(table_structure: List[Dict], file_path: str):
    # Save to file
    with open(config.TABLE_STRUCTURE_FILE, 'w') as f:
        json.dump(table_structure, f, indent=2)
    # Return the file as a response for download
    return send_file(
        config.TABLE_STRUCTURE_FILE,
        as_attachment=True,
        download_name='table_structure.json',
        mimetype='application/json'
    )

def get_mysql_table_structure(selected_connection):
    conn = get_mysql_connection(selected_connection)
    cursor = conn.cursor(dictionary=True)

    # Get list of tables in the database
    cursor.execute("SHOW TABLES")
    tables = [table[f'Tables_in_{conn.database}'] for table in cursor.fetchall()]

    # Collect table structures
    table_structures = {}
    for table in tables:
        cursor.execute(f"DESCRIBE {table}")
        columns = cursor.fetchall()

        # Convert column info to a more friendly format
        table_structures[table] = [
            {
                'name': column['Field'],
                'type': column['Type'],
                'null': column['Null'],
                'key': column['Key'],
                'default': column['Default'],
                'extra': column['Extra']
            } for column in columns
        ]

    cursor.close()
    conn.close()

    return table_structures

def get_mssql_table_structure(selected_connection):
    conn = get_mssql_connection(selected_connection)
    cursor = conn.cursor()

    # Get list of tables with schema in the database
    cursor.execute("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
    tables = [(row[0], row[1]) for row in cursor.fetchall()]

    # Collect table structures
    table_structures = {}
    for schema, table in tables:
        cursor.execute("""
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        """, (schema, table))
        columns = cursor.fetchall()
        # Get column names from cursor description
        col_names = [desc[0].lower() for desc in cursor.description]
        # Combine schema and table name for the key
        table_key = f"{schema}.{table}"
        # Convert column info to a more friendly format
        table_structures[table_key] = [
            {
                'name': col[0],
                'type': col[1],
                'null': col[2],
                'key': '',  # MSSQL: Key info not directly available here
                'default': col[3],
                'extra': ''
            } for col in columns
        ]

    cursor.close()
    conn.close()

    return table_structures