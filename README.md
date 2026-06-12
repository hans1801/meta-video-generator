# Meta Video Generator

Este proyecto es una extensión de Chrome desarrollada con [WXT](https://wxt.dev/) y React.

## Requisitos Previos

- Node.js
- npm o pnpm

## Instalación

Instala las dependencias del proyecto ejecutando:

```bash
npm install
# o
pnpm install
```

## Modo Desarrollo (Dev)

Para ejecutar el proyecto en modo de desarrollo y ver los cambios en tiempo real, simplemente ejecuta:

```bash
npm run dev
# o
pnpm run dev
```

**¿Qué hace este comando?**
- Inicia el servidor de desarrollo local con recarga en caliente (Hot Module Replacement).
- **Abre automáticamente una nueva ventana del navegador** configurada como un perfil de prueba, con tu extensión ya instalada y lista para usarse. 

*Nota: Si cierras el navegador de prueba, puedes presionar `o + enter` en la terminal donde se está ejecutando el script para volver a abrirlo.*

## Construcción y Carga Manual en Chrome

Si deseas compilar la versión final de la extensión o instalarla en tu perfil de Chrome principal:

1. Ejecuta el comando de construcción:

   ```bash
   npm run build
   # o
   pnpm run build
   ```

2. Esto generará una carpeta llamada `.output/chrome-mv3` (o similar) en la raíz de tu proyecto.
3. Abre tu navegador Chrome y ve a la dirección: `chrome://extensions/`
4. Activa el **Modo de desarrollador** (interruptor en la esquina superior derecha).
5. Haz clic en el botón **Cargar descomprimida** (Load unpacked) en la parte superior izquierda.
6. Selecciona la carpeta `.output/chrome-mv3` que se acaba de generar.

¡Listo! La extensión ahora estará instalada en tu navegador principal.
