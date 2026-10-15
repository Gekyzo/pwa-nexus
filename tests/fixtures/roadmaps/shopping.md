# Roadmap

Planned features, not in order of priority. `CHANGELOG.md` records what shipped.

## Planned

- **Screens BG**. Add subtle-corner/ghost illustrations to the screens.
- **Reset setting**. Reset app data, with confirmation.
- **Responsive**. Adapt screens to different phones sizes, models, viewport,foldable phones, tablets.
- **Optional reagents**. Make reagents optional.
- **Store sections.** Add the category or section of the store to each product.
  The sections are configurable in the settings.
- **Recipe categories.** Give each recipe one or more categories, such as
  lunch, dinner or healthy, and filter the recipes by category.

### Deferred

Not needed yet. Each item names what makes it needed.

- **Browser database.** Store the data in the browser database instead of
  `localStorage`. Unnecessary until the state nears the 5 MB limit of
  `localStorage`, or until a feature requires it: purchase or price history,
  photos, or sync.
- **Price estimation.** Estimate the price of a list. Unnecessary until the
  products have prices, from a price field or from **Purchase history**.
- **Send a copy.** Send a list to a contact as a link, through the Android
  share sheet. The list travels in the link fragment, with no server and no
  login. The contact gets a copy; later changes do not sync. Unnecessary until a
  second person shops from the lists.

## Pro

Candidate features for a paid version. Nothing here is committed. The free
version keeps `Actual`, `Próxima`, `Recetas`, `Menú` and offline use.

### Cloud storage

Back up the data to a server and restore it on a new phone with a recovery
link, with no login. The features below need its server.

- **Sync between devices.** Keep the lists the same on a phone, a tablet and the
  web.
- **Live shared list.** Share a list with a contact so that both edit the same
  list. The link is the access: a random list id and an encryption key in the
  link fragment, with no login. The server stores only encrypted changes; the
  phones merge them item by item.

### AI integration

Add items from free text, a photo or a voice note; group them by store
section; suggest substitutes for missing products. The features below need its
model.

- **Automatic recipes and menus.** Generate recipes and a weekly menu from
  preferences, diets and the products at home, and add the missing products to
  `Próxima`.
- **Receipt scan.** Read a photo of a receipt to tick the items, record the
  prices and keep the total.

### Purchase history

Record each purchase on the phone: the product, the date, the shop and the
price. It needs the **Browser database**. The features below need the history.

- **Restock.** Learn how often each product is bought and suggest it when it is
  likely to run out.
- **Price history.** Show the price trend of each product and the cheapest
  shop. Extends **Price estimation**.
- **Spend statistics.** Spend by month, by shop and by store section.

### Other

- **Pantry.** Track the products at home, with expiry dates and a reminder
  before a product expires. Feeds the menu generation.
- **Nutrition.** Show calories and nutrients for a recipe and for the weekly
  menu.
