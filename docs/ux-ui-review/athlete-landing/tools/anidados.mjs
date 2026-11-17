// <button> dentro de <button> (el disparador del popover de descanso envuelve al chip) no se puede
// expresar en HTML: el parser cierra el primero y cambia el árbol. En el markup se guardan como
// <button-anidado> y un script los reconstruye con la API del DOM, igual que lo hace React.
export function codificarAnidados(html) {
  let prof = 0;
  const pila = [];
  return html.replace(/<(\/?)button(-anidado)?(?=[\s>])/g, (m, cierre) => {
    if (!cierre) {
      const anidado = prof > 0;
      pila.push(anidado);
      prof++;
      return anidado ? "<button-anidado" : "<button";
    }
    prof--;
    return pila.pop() ? "</button-anidado" : "</button";
  });
}

/** Script (en el navegador): convierte cada <button-anidado> en un <button> real. */
export const RECONSTRUIR_JS = `function mockupAnidados(raiz){Array.prototype.forEach.call((raiz||document).querySelectorAll("button-anidado"),function(el){var b=document.createElement("button");Array.prototype.forEach.call(el.attributes,function(a){b.setAttribute(a.name,a.value)});while(el.firstChild)b.appendChild(el.firstChild);el.parentNode.replaceChild(b,el)})}`;
