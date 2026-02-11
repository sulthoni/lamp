import pyodbc

# Update with your connection details
server = '127.0.0.1,1433'  # or IP address
database = 'designer-dev'
username = 'SA'
password = 'VaroAlarick59@docker!#'
driver = '{ODBC Driver 18 for SQL Server}'  # Check `odbcinst -q -d -n` for exact driver name

# Connection string
conn_str = (
    f'DRIVER={driver};'
    f'SERVER={server};'
    f'DATABASE={database};'
    f'UID={username};'
    f'PWD={password};'
    'TrustServerCertificate=Yes;'
)

try:
    # Connect
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()

    # Execute a query
    cursor.execute("SELECT name FROM sys.databases;")
    for row in cursor.fetchall():
        print(row.name)

except pyodbc.Error as e:
    print("Error:", e)
finally:
    if 'conn' in locals():
        conn.close()
