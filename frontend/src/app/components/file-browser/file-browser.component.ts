import { Component } from '@angular/core';
// import { ToastrService, ToastrModule } from 'ngx-toastr';
import { OntologyService } from '../../services/ontology.service';

@Component({
  selector: 'app-file-browser',
  imports: [],
  templateUrl: './file-browser.component.html',
  styleUrl: './file-browser.component.css',
})
export class FileBrowserComponent {
  constructor(
    private ontologyService: OntologyService
  ) // private toastr: ToastrService
  {}

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const content = e.target.result;
        this.ontologyService.parseTurtle(content).then(
          () => {
            // this.toastr.success('Ontology loaded successfully!', 'Success');
          },
          (error) => {
            console.error('Error parsing file', error);
            // this.toastr.error('Error parsing ontology!', 'Error');
          }
        );
      };
      reader.readAsText(file);
    }
  }
}
