-- Backfill stock/icon on the placeholder gifts seeded in 0004_seed_gifts.sql.
update public.gifts set stock_level = 100, image_emoji = '🎁' where name = '$5 Gift Card';
update public.gifts set stock_level = 50, image_emoji = '🎁' where name = '$10 Gift Card';
update public.gifts set stock_level = 20, image_emoji = '🎁' where name = '$25 Gift Card';
