# Notas de la versión

Lo que cambia para ti en cada versión de la app. La versión más nueva va primero.

## Unreleased

- El título de la aplicación está en el idioma de la aplicación, por ejemplo en la ventana y en la lista de aplicaciones abiertas.

## 0.1.16 - 2026-10-24

- `Deshacer` tras `Borrar` durante una sincronización ya no vuelve a añadir el elemento al final de su sección con dos commits de más.
- Un proyecto quitado durante una sincronización ya no envía sus cambios en espera.
- Un cambio que llegó a GitHub mientras se cortaba la conexión ya no se muestra como fallido en la siguiente sincronización.
- `Deshacer` tras `Descartar`, quitar un proyecto o importar ya no recupera cambios que una sincronización envió a GitHub entretanto.
- Si una sección tiene dos elementos con el mismo título, el segundo es de solo lectura y pide editarlo en GitHub, en lugar de abrir y cambiar el primero.

## 0.1.15 - 2026-10-24

- `Ajustes` › `Ayuda` › `Novedades` muestra lo que cambia en cada versión. Tras una actualización, se abre sola una vez.
