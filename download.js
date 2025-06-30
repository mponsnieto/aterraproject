function downloadPDF() {
  const element = document.getElementById('calculator');
  const opt = {
    margin:       0.5,
    filename:     'resultados_agrivoltaica.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(element).save();
}