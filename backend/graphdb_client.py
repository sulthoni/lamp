import requests
import json
from rdflib import Graph
from rdflib.namespace import RDF, RDFS, XSD
from rdflib.serializer import Serializer
from rdflib.util import guess_format

class GraphDBClient:
    def __init__(self, graphdb_url, graphdb_repo_id = None):
        self.graphdb_url = graphdb_url
        self.graphdb_repo_id = graphdb_repo_id  # Repository ID

    def create_repository(self, repo_id, repo_config):
        headers = {'Content-Type': 'application/json'}
        url = f'{self.graphdb_url}/rest/repositories'
        print('url:' + url)
        response = requests.post(url, headers=headers, data=json.dumps(repo_config))
        response.raise_for_status()
        
        self.graphdb_repo_id = repo_id
        print(response)
        return response.status_code

    def upload_turtle_data(self, turtle_data):
         if not self.graphdb_repo_id:
             raise ValueError("Repository ID not set.")
        
         headers = {'Content-Type': 'text/turtle'}
         url = f'{self.graphdb_url}/repositories/{self.graphdb_repo_id}/statements'
         response = requests.post(url, headers=headers, data=turtle_data.encode('utf-8'))
         response.raise_for_status()
         return response.status_code

    def upload_r2rml_data(self, r2rml_data):
        if not self.graphdb_repo_id:
            raise ValueError("Repository ID not set.")
        
        headers = {'Content-Type': 'text/turtle'}
        url = f'{self.graphdb_url}/repositories/{self.graphdb_repo_id}/rdf-graph-management/import/upload/rdf'
        response = requests.post(url, headers=headers, data=r2rml_data.encode('utf-8'), params={'baseURI': 'http://example.org/'}) 
        response.raise_for_status()
        return response.status_code
    

    def execute_sparql_query(self, query):
        if not self.graphdb_repo_id:
             raise ValueError("Repository ID not set.")
        
        headers = {'Accept': 'application/sparql-results+json'}
        params = {'query': query}
        url = f'{self.graphdb_url}/repositories/{self.graphdb_repo_id}'
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()

    def get_jsonld_data(self):
        if not self.graphdb_repo_id:
             raise ValueError("Repository ID not set.")
        
        headers = {'Accept': 'application/ld+json'}
        params = {'infer': 'false'}
        url = f'{self.graphdb_url}/repositories/{self.graphdb_repo_id}/statements'
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        jsonld_data = response.json()
        return jsonld_data

    def get_jsonld_data(self):
        if not self.graphdb_repo_id:
             raise ValueError("Repository ID not set.")
        
        headers = {'Accept': 'application/ld+json'}
        params = {'infer': 'false'}
        url = f'{self.graphdb_url}/repositories/{self.graphdb_repo_id}/statements'
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        jsonld_data = response.json()
        return jsonld_data