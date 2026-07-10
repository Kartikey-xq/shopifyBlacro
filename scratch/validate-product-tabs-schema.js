const fs = require('fs');

try {
  const content = fs.readFileSync('/home/kartikey-xq/shopifyBlacro/blocks/product-info-tabs.liquid', 'utf8');
  const schemaMatch = content.match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/);
  if (!schemaMatch) {
    console.error('No schema block found!');
    process.exit(1);
  }
  const schemaJson = schemaMatch[1].trim();
  JSON.parse(schemaJson);
  console.log('Success: Schema JSON is 100% valid!');
} catch (err) {
  console.error('Error parsing schema JSON:', err.message);
  process.exit(1);
}
