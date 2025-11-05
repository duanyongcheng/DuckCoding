// lib.rs - 暴露服务层给 CLI 和 GUI 使用

pub mod models;
pub mod utils;
pub mod services;

pub use models::*;
pub use utils::*;
pub use services::*;

// 重新导出常用类型
pub use anyhow::{Result, Context};
