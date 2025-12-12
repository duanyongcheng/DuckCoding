//! 配置服务工具函数

use toml_edit::{Item, Table};

/// 合并 TOML 表格，保留注释和格式
///
/// 该函数会递归合并 source 到 target：
/// - 删除 target 中不存在于 source 的键
/// - 递归合并嵌套表格
/// - 保留现有值的注释和格式
pub(crate) fn merge_toml_tables(target: &mut Table, source: &Table) {
    // 删除 target 中不在 source 中的键
    let keys_to_remove: Vec<String> = target
        .iter()
        .map(|(key, _)| key.to_string())
        .filter(|key| !source.contains_key(key))
        .collect();
    for key in keys_to_remove {
        target.remove(&key);
    }

    // 合并 source 中的所有键值
    for (key, item) in source.iter() {
        match item {
            Item::Table(source_table) => {
                let needs_new_table = match target.get(key) {
                    Some(existing) => !existing.is_table(),
                    None => true,
                };

                if needs_new_table {
                    let mut new_table = Table::new();
                    new_table.set_implicit(source_table.is_implicit());
                    target.insert(key, Item::Table(new_table));
                }

                if let Some(target_item) = target.get_mut(key) {
                    if let Some(target_table) = target_item.as_table_mut() {
                        target_table.set_implicit(source_table.is_implicit());
                        merge_toml_tables(target_table, source_table);
                        continue;
                    }
                }

                target.insert(key, item.clone());
            }
            Item::Value(source_value) => {
                let mut updated = false;
                if let Some(existing_item) = target.get_mut(key) {
                    if let Some(existing_value) = existing_item.as_value_mut() {
                        // 保留原有的注释和格式
                        let prefix = existing_value.decor().prefix().cloned();
                        let suffix = existing_value.decor().suffix().cloned();
                        *existing_value = source_value.clone();
                        let decor = existing_value.decor_mut();
                        decor.clear();
                        if let Some(pref) = prefix {
                            decor.set_prefix(pref);
                        }
                        if let Some(suf) = suffix {
                            decor.set_suffix(suf);
                        }
                        updated = true;
                    }
                }

                if !updated {
                    target.insert(key, Item::Value(source_value.clone()));
                }
            }
            _ => {
                target.insert(key, item.clone());
            }
        }
    }
}
