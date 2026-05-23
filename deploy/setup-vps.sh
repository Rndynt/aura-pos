#!/bin/bash
# AuraPOS VPS Setup Script
# Jalankan di VPS sebagai root/sudo

echo "=== AuraPOS VPS Setup ==="

# 1. Copy nginx config
cp nginx.conf /etc/nginx/sites-available/aurapos

# 2. Enable site (hapus default jika ada)
ln -sf /etc/nginx/sites-available/aurapos /etc/nginx/sites-enabled/aurapos
rm -f /etc/nginx/sites-enabled/default

# 3. Test config
nginx -t

# 4. Reload nginx
systemctl reload nginx

echo ""
echo "✅ Nginx dikonfigurasi untuk *.aurapos.my.id"
echo ""
echo "Langkah selanjutnya:"
echo "1. Pastikan DNS wildcard sudah set:"
echo "   *.aurapos.my.id  A  $(curl -s ifconfig.me)"
echo "   aurapos.my.id    A  $(curl -s ifconfig.me)"
echo ""
echo "2. Test subdomain:"
echo "   curl -H 'Host: thamada.aurapos.my.id' http://localhost/"
echo ""
echo "3. Jika app belum jalan, jalankan:"
echo "   cd /path/to/AuraPoS && npm run dev"
