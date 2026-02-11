import os
import json
import mysql.connector
import pyodbc
from typing import Dict, List
from flask import send_file
from utils import Config

config = Config()

def load_connections() -> List[Dict]:
    if os.path.exists(config.CONNECTIONS_FILE):
        with open(config.CONNECTIONS_FILE, 'r') as f:
            return json.load(f)
    return []

def save_connections(connections: List[Dict]):
    with open(config.CONNECTIONS_FILE, 'w') as f:
        json.dump(connections, f, indent=2)

def get_mysql_connection(params: Dict):
    return mysql.connector.connect(
        host=params['host'],
        port=params['port'],
        database=params['database'],
        user=params['username'],
        password=params['password']
    )
    raise Exception("No MySQL connection found")

def get_mssql_connection(params: Dict):
    conn_str = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={params['host']},{params['port']};"
        f"DATABASE={params['database']};"
        f"UID={params['username']};"
        f"PWD={params['password']};"
        "TrustServerCertificate=Yes;"
    )
    return pyodbc.connect(conn_str)
    raise Exception("No MSSQL connection found")

def test_mysql_connection(params: Dict) -> bool:
    try:
        conn = mysql.connector.connect(
            host=params['host'],
            port=params['port'],
            database=params['database'],
            user=params['username'],
            password=params['password']
        )
        print('mysq server connection success')
        conn.close()
        return True
    except Exception as e:
        print('mysq server connection failed' + str(e))
        raise Exception(f"MySQL connection failed: {str(e)}")

def test_mssql_connection(params: Dict) -> bool:
    try:
        conn_str = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={params['host']},{params['port']};"
            f"DATABASE={params['database']};"
            f"UID={params['username']};"
            f"PWD={params['password']};"
            "TrustServerCertificate=Yes;"
        )
        conn = pyodbc.connect(conn_str)
        print('sql server connection success')
        conn.close()
        return True
    except Exception as e:
        print(conn_str)
        print('sql server connection failed' + str(e))
        raise Exception(f"MSSQL connection failed: {str(e)}")

def get_sample_data_mysql(connection_params: Dict, table_name: str, limit: int = 10) -> List[Dict]:
    """Get sample data from MySQL table"""
    try:
        conn = get_mysql_connection(connection_params)
        cursor = conn.cursor(dictionary=True)
        
        # Use parameterized query with LIMIT
        query = f"SELECT * FROM `{table_name}` LIMIT %s"
        cursor.execute(query, (limit,))
        
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return results
    except Exception as e:
        raise Exception(f"Failed to get sample data from MySQL: {str(e)}")

def get_sample_data_mssql(connection_params: Dict, table_name: str, limit: int = 10) -> List[Dict]:
    """Get sample data from MSSQL table"""
    try:
        conn = get_mssql_connection(connection_params)
        cursor = conn.cursor()
        
        # Use TOP clause for MSSQL
        query = f"SELECT TOP (?) * FROM [{table_name}]"
        cursor.execute(query, limit)
        
        # Get column names
        columns = [column[0] for column in cursor.description]
        
        # Convert rows to dictionaries
        results = []
        for row in cursor.fetchall():
            results.append(dict(zip(columns, row)))
        
        cursor.close()
        conn.close()
        
        return results
    except Exception as e:
        raise Exception(f"Failed to get sample data from MSSQL: {str(e)}")

def get_foreign_keys_mysql(connection_params: Dict, table_name: str) -> List[Dict]:
    """Get foreign key information from MySQL table"""
    try:
        conn = get_mysql_connection(connection_params)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            COLUMN_NAME as columnName,
            REFERENCED_TABLE_NAME as referencedTableName,
            REFERENCED_COLUMN_NAME as referencedColumnName,
            CONSTRAINT_NAME as constraintName
        FROM 
            INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE 
            TABLE_SCHEMA = %s 
            AND TABLE_NAME = %s 
            AND REFERENCED_TABLE_NAME IS NOT NULL
        """
        
        cursor.execute(query, (connection_params['database'], table_name))
        results = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return results
    except Exception as e:
        raise Exception(f"Failed to get foreign keys from MySQL: {str(e)}")

def get_foreign_keys_mssql(connection_params: Dict, table_name: str) -> List[Dict]:
    """Get foreign key information from MSSQL table"""
    try:
        conn = get_mssql_connection(connection_params)
        cursor = conn.cursor()
        
        query = """
        SELECT 
            COL_NAME(fc.parent_object_id, fc.parent_column_id) AS columnName,
            OBJECT_NAME(fc.referenced_object_id) AS referencedTableName,
            COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS referencedColumnName,
            fk.name AS constraintName
        FROM 
            sys.foreign_keys AS fk
            INNER JOIN sys.foreign_key_columns AS fc ON fk.object_id = fc.constraint_object_id
        WHERE 
            OBJECT_NAME(fc.parent_object_id) = ?
        """
        
        cursor.execute(query, table_name)
        
        # Get column names
        columns = [column[0] for column in cursor.description]
        
        # Convert rows to dictionaries
        results = []
        for row in cursor.fetchall():
            results.append(dict(zip(columns, row)))
        
        cursor.close()
        conn.close()
        
        return results
    except Exception as e:
        raise Exception(f"Failed to get foreign keys from MSSQL: {str(e)}")