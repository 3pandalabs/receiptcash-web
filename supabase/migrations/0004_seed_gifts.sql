-- Placeholder gift catalog for testing the redeem flow end-to-end.
-- Replace with real gift catalog/fulfillment data before launch.
insert into public.gifts (name, description, points_cost, is_active) values
  ('$5 Gift Card', 'Placeholder reward - swap for a real fulfillment partner before launch', 500, true),
  ('$10 Gift Card', 'Placeholder reward - swap for a real fulfillment partner before launch', 1000, true),
  ('$25 Gift Card', 'Placeholder reward - swap for a real fulfillment partner before launch', 2500, true);
