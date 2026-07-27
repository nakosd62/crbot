import os
import random
import psycopg2
from psycopg2.extras import execute_values

# Connection Details
DEFAULT_CONN = "postgresql://dimitris:HmO8lJiiYJTO5-B6HvA-Ew@warm-katydid-17872.jxf.gcp-us-east1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_CONN)

def insert_random_accounts(count=1000):
    print("Connecting to CockroachDB...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Generate 1000 unique IDs to use as client IDs
        print("Generating random account data...")
        unique_ids = set()
        while len(unique_ids) < count:
            unique_ids.add(random.randint(1000, 999999))
        
        # Generate random dimension values
        names = ["Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace", "Henry", "Ivy", "Jack", 
                 "Kate", "Liam", "Mia", "Noah", "Olivia", "Paul", "Quinn", "Ryan", "Sophia", "Thomas"]
         
        city_states = ["New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Miami, FL", "Seattle, WA", 
                "Boston, MA", "San Francisco, CA", "Washington, DC", "Atlanta, GA", "Detroit, MI", "Philadelphia, PA", 
                "Phoenix, AZ", "San Diego, CA", "San Antonio, TX", "Charlotte, NC"]

        number_streets = ["Main St", "Oak Ave", "Maple Rd", "Pine St", "Cedar Ln", "Elm St", "Washington Ave", "Franklin St", 
            "Broadway", "Union St", "Park Ave", "Market St", "First St", "Second St", "Third St", "Fourth St", "Fifth St", 
            "Sixth St", "Seventh St", "Eighth St", "Ninth St", "Tenth St"]


        data = []
        for id in unique_ids:
            name = random.choice(names)
            city_state = random.choice(city_states)
            number_street = random.choice(number_streets)
            data.append((id, name, city_state, number_street))
#            balance = round(random.uniform(5.00, 50000.00), 2)
#            data.append((account_id, name, balance, address))

        # Batch insert for performance
        print(f"Inserting {count} rows into the 'clients' table...")
        insert_query = """
            INSERT INTO clients (id, name, city_state, number_street) 
            VALUES %s 
        """
        
        execute_values(cursor, insert_query, data)
        print("Successfully inserted rows!")
        
        # Get count to verify
        cursor.execute("SELECT COUNT(*) FROM clients;")
        total_accounts = cursor.fetchone()[0]
        print(f"Verification: There are now {total_accounts} clients in the table.")
        
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    insert_random_accounts(1000)
