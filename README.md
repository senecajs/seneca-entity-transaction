To run the tests:
```
# Build the services required by the automated tests.
docker-compose -f docker-compose.test.yaml build

# Run the services required by the automated tests.
docker-compose -f docker-compose.test.yaml up -d

# Run the tests.
npm run test
```

To sign in to the mysql test instance, e.g. to inspect the test db state:
```
docker-compose -f docker-compose.test.yaml exec mysql_test bash

# Once you are inside the container:
mysql -pmysql

# Once you are in the MySQL shell:
USE senecatest;
```

To sign in to the postgres test instance:
```
docker-compose -f docker-compose.test.yaml exec postgres_test bash

# Once you are inside the container:
psql -U postgres

# Once you are in the postgres shell:
\c senecatest
```

When you are done, stop the containers:
```
docker-compose -f docker-compose.test.yaml down
```

