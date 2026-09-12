# Photo attribution

Stock photos for the sample restaurants and categories. All are from Unsplash
(https://unsplash.com/license), downloaded at `?w=900&q=70&auto=format&fit=crop`,
then centre-cropped to 900×506 and re-encoded as progressive JPEG under 120 KB.
The bundled copies here were then converted to WebP (q80, `cwebp -m 6`), which is
~27% smaller; re-encoding the already-q70 JPEGs made them larger, so WebP was the
only format change that actually saved space.

| File | Subject | Source |
| --- | --- | --- |
| `ramen-bar-oakland.webp` | Ramen bowl with egg | https://unsplash.com/photos/1569718212165-3a8278d5f624 — https://images.unsplash.com/photo-1569718212165-3a8278d5f624 |
| `mad-mex-shadyside.webp` | Tacos | https://images.unsplash.com/photo-1565299585323-38d6b0865b47 |
| `sichuan-gourmet.webp` | Chinese chicken and broccoli with rice | https://images.unsplash.com/photo-1525755662778-989d0524087e |
| `pizza-milano.webp` | Margherita pizza | https://images.unsplash.com/photo-1574071318508-1cdbab80d002 |
| `prince-of-india.webp` | Indian curries | https://images.unsplash.com/photo-1585937421612-70a008356fbe |
| `bangkok-balcony.webp` | Thai curry spread | https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4 |
| `burgatory-waterfront.webp` | Cheeseburger | https://images.unsplash.com/photo-1568901346375-23c9450c58cd |
| `sushi-fuku.webp` | Sushi rolls | https://images.unsplash.com/photo-1579871494447-9811cf80d66c |
| `salems-market-grill.webp` | Chicken shawarma | https://images.unsplash.com/photo-1529006557810-274b9b2fc783 |
| `noodlehead.webp` | Pad thai | https://images.unsplash.com/photo-1559314809-0d155014e29e |
| `giant-eagle-market-district.webp` | Grocery produce shelves | https://images.unsplash.com/photo-1542838132-92c53300491e |
| `whole-foods-east-liberty.webp` | Grocery aisle | https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8 |
| `primanti-bros-oakland.webp` | Grilled sandwich | https://images.unsplash.com/photo-1528735602780-2552fd46c7af |
| `pamelas-diner-oakland.webp` | Pancakes with blueberries | https://images.unsplash.com/photo-1506084868230-bb9d95c24759 |
| `daves-hot-chicken.webp` | Fried chicken | https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58 |
| `prantls-bakery-shadyside.webp` | Chocolate cake | https://images.unsplash.com/photo-1578985545062-69928b1d9587 |
| `cat-italian.webp` | Penne (Italian category) | https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9 |
| `cat-healthy.webp` | Salad bowl (Healthy category) | https://images.unsplash.com/photo-1512621776951-a57141f2eefd |
| `cat-coffee.webp` | Latte (Coffee category) | https://images.unsplash.com/photo-1509042239860-f550ce710b93 |
| `cat-vegan.webp` | Vegetable platter (Vegan category) | https://images.unsplash.com/photo-1540420773420-3366772f4999 |

The `cat-*.webp` photos stand in for listings whose category has no seed
restaurant photo of its own (see `src/lib/photos.ts`).
